---
title: "From One Node to Three: Expanding My k3s Cluster on Raspberry Pi"
date: 2026-03-30
description: "How I expanded a single-node k3s homelab into a three-node cluster, hit every classic Raspberry Pi gotcha along the way, and learned why podAntiAffinity matters more than nodeSelector."
pubDate: 2026-03-30
hero: "posts/2026-03-30/cluster-expansion-hero.svg"
tags: ["kubernetes", "k3s", "raspberry-pi", "homelab", "gitops"]
---
 
My pi-cluster has been running as a single Raspberry Pi 4 (8GB) for about three months now. FluxCD, SOPS-encrypted secrets, Cloudflare Tunnels, the full GitOps stack. It works. But "works" and "production-minded" are not the same thing when all your redundancy is a lie. I had `replicas: 2` on my cloudflared tunnel deployments, but both pods ran on the same node. If that Pi lost power, both replicas died together. Two is not redundant when they share a single point of failure.
 
Time to fix that. Two more Raspberry Pi 4s joined the fleet: a 4GB unit and a 2GB unit.
 
## The Plan
 
The expansion had four phases:
 
1. **Pre-flight recon** - gather info, plan IPs and hostnames, understand what we are actually doing
2. **OS provisioning** - flash cards, configure SSH, set static IPs, enable cgroups
3. **k3s agent joining** - register both new Pis with the existing cluster
4. **Workload placement** - use podAntiAffinity to spread cloudflared pods for real HA
 
Every change to the cluster goes through Git. That rule did not change just because we added hardware.
 
## Node Roster
 
| Role | Hostname | IP | RAM |
|---|---|---|---|
| Server | kubepi | 192.168.x.x | 8GB |
| Agent | kubepi-w1 | 192.168.x.x | 4GB |
| Agent | kubepi-w2 | 192.168.x.x | 2GB |
 
Both new nodes are agents (workers), not servers. The server node runs the Kubernetes API server, scheduler, controller manager, and an embedded SQLite database. Those components consume real memory even in k3s's compressed single-binary form. The 2GB Pi would barely function as a server. Agents just run the kubelet, connect to the API at port 6443, and execute whatever the scheduler sends them.
 
Important distinction: the server node is also a worker. It runs pods alongside the control plane. So after expansion I have three nodes all capable of running workloads, but only one running the brains.
 
## The cgroups Gotcha
 
This is the one that gets everyone on Raspberry Pi OS. I actually tried to join my first worker before configuring cgroups and got this in the agent logs:
 
```
level=fatal msg="Error: failed to find memory cgroup (v2)"
```
 
Here is why. When you set `resources.requests.memory: 128Mi` in a Kubernetes manifest, the kubelet does not enforce that itself. It delegates to the Linux kernel via cgroups (control groups), which is the kernel feature that puts processes into resource boxes. Raspberry Pi OS ships with memory cgroups disabled by default to save overhead.
 
Without memory cgroups, the node joins and shows up in `kubectl get nodes`, but Kubernetes cannot actually manage memory. Pods fail to schedule, or worse, they schedule but the OOM killer starts making decisions that Kubernetes did not approve.
 
The fix is a single addition to `/boot/firmware/cmdline.txt` (appended to the existing single line, never a second line):
 
```
cgroup_memory=1 cgroup_enable=memory
```
 
Reboot, and the agent starts cleanly. I configured this on the second worker before attempting the join. Learning from a mistake once is experience. Hitting the same error twice is a choice.
 
## Joining the Cluster
 
The k3s agent join is a single command. It needs two things: the server's API address and a node token. The token lives at `/var/lib/rancher/k3s/server/node-token` on the server node. It is scoped to node joining only. It cannot deploy workloads, read secrets, or do anything through the Kubernetes API. Your kubeconfig at `/etc/rancher/k3s/k3s.yaml` is the full admin key. Very different blast radius.
 
```bash
curl -sfL https://get.k3s.io | \
  K3S_URL=https://192.168.x.x:6443 \
  K3S_TOKEN=<token> sh -
```
 
After running this on each worker, `kubectl get nodes` on the server showed three nodes, all Ready. Kubernetes immediately started scheduling DaemonSet pods (node-exporter and svclb-traefik) onto the new workers. I did not ask for this. DaemonSets automatically place one pod per node in the cluster. That is their whole purpose.
 
## The PVC Problem
 
My first instinct was to move workloads to the new nodes. Linkding is lightweight, put it on the 4GB worker. Vikunja could go there too. But there is a hard constraint I had to understand first.
 
Every stateful workload in my cluster (linkding, CouchDB for Obsidian sync, Postgres for Vikunja) uses a PersistentVolumeClaim backed by k3s's `local-path` provisioner. That provisioner creates a directory under `/var/lib/rancher/k3s/storage/` on the node where the PVC was first created. My data is physically on the server node's storage.
 
If I schedule linkding on `kubepi-w1`, Kubernetes cannot reach across the network to grab that directory from `kubepi`. The pod either hangs in Pending or starts with an empty volume. Moving stateful workloads requires either migrating the data or implementing a distributed storage solution like Longhorn. That is a future project, not a today project.
 
So the real win is distributing **stateless** workloads. And the most impactful stateless workloads in my cluster are the cloudflared tunnel pods.
 
## podAntiAffinity: Spreading Pods the Right Way
 
I had two options for controlling where pods land:
 
**nodeSelector** pins a pod to a specific node by label. Rigid. If that node goes down, the pod cannot reschedule elsewhere without changing the YAML.
 
**podAntiAffinity** defines relationships between pods. "Do not put me on a node that already has another pod matching this label." It does not care which nodes exist or how many there are. Add a fourth node next year and it automatically takes advantage without touching any manifests.
 
For cloudflared, the goal is "never put both replicas on the same node." That is a pod-to-pod relationship, so podAntiAffinity is the right tool:
 
```yaml
spec:
  template:
    spec:
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchLabels:
                    app: cloudflared
                topologyKey: kubernetes.io/hostname
      containers:
        - name: cloudflared
          ...
```
 
I used `preferred` instead of `required` on purpose. If a worker dies and I used `required`, Kubernetes could not reschedule the displaced pod because putting two cloudflared pods on the same node would violate the hard rule. With `preferred`, it gracefully degrades to two-on-one until the worker recovers. HA should fail gracefully, not fail completely.
 
After committing the affinity changes to all three cloudflared deployments and letting Flux reconcile:
 
```
NAMESPACE       NAME                            NODE
linkding        cloudflared-785c845b7f-4pfp9    kubepi-w1
linkding        cloudflared-785c845b7f-vjgdk    kubepi-w2
obsidian-sync   cloudflared-66c78bdbcc-2x7zn    kubepi-w1
obsidian-sync   cloudflared-66c78bdbcc-crg4t    kubepi-w2
vikunja         cloudflared-785c845b7f-c4cd9    kubepi-w1
vikunja         cloudflared-785c845b7f-x272k    kubepi-w2
```
 
Six tunnel pods, evenly split across two workers. If either worker dies, every app still has one live tunnel pod on the surviving worker. That is actual redundancy.
 
## Other Fixes Along the Way
 
**linkding securityContext bug.** My very first Kubernetes deployment had an indentation error that has been sitting in the repo for three months:
 
```yaml
# Wrong - siblings, allowPrivilegeEscalation is ignored
securityContext: 
allowPrivilegeEscalation: false
 
# Right - parent/child, actually enforced
securityContext:
  allowPrivilegeEscalation: false
```
 
Two spaces. That is all it took to go from "security setting is silently ignored" to "security setting is enforced." YAML does not warn you about this.
 
**Worker role labels.** k3s does not automatically label agent nodes with a role, so `kubectl get nodes` shows `<none>` in the ROLES column. A quick label makes the output cleaner:
 
```bash
kubectl label node kubepi-w1 node-role.kubernetes.io/worker=true
kubectl label node kubepi-w2 node-role.kubernetes.io/worker=true
```
 
## Lessons
 
1. Static IPs before joining. DHCP changes after k3s registration will break node communication.
2. cgroups memory is not optional. Enable it before you even install k3s.
3. `local-path` PVCs are node-bound. Know this before planning workload moves.
4. `preferred` anti-affinity is almost always better than `required`. Let the scheduler degrade gracefully.
5. `kubectl` only works on the server node. Agent nodes do not run the API server.
6. YAML indentation bugs are silent killers. Two spaces in the wrong direction and your security settings are decoration.
7. `replicas: 2` on a single node is not redundancy. It is two copies of the same single point of failure.
 
## What is Next
 
The stateful workloads are still pinned to the server node by their PVCs. A distributed storage solution (Longhorn is the leading candidate for ARM64) would unlock true mobility for those workloads. Grafana also still needs a Cloudflare Tunnel since it is currently internal-only via `kubectl port-forward` with a self-signed cert that browsers do not trust.
 
But today, the cluster went from one node pretending to be resilient to three nodes with genuinely distributed workloads. That is progress worth committing.

All manifests for this setup live at [github.com/MrGuato/pi-cluster](https://github.com/MrGuato/pi-cluster).
 
*Built with ❤️ by Jonathan - If it is not in Git, it does not exist.*