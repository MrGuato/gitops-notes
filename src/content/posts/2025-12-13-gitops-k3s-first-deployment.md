---
title: "Kubernetes Journey: GitOps on Raspberry Pi with FluxCD"
date: 2025-12-13
description: "GitOps on a Raspberry Pi k3s cluster with FluxCD, and my first real workload: Linkding."
hero: "posts/2026-01-13/hero.png"
---

# Kubernetes Journey: GitOps on Raspberry Pi with FluxCD

Today was a big milestone in my Kubernetes journey. I finished setting up GitOps on my Raspberry Pi k3s cluster, wired it to GitHub with FluxCD, and successfully deployed my first real workload: **Linkding** - entirely through Git.

This post isn’t a step-by-step guide. It’s a build log of what I accomplished, the issues I hit, and why this setup matters since I am serious about learning Kubernetes the right way.

---

## What I Wanted to Accomplish this Week
My goals were simple, but foundational:

* Finalize my Raspberry Pi Kubernetes foundation
* Ensure I can manage the cluster remotely
* Install and validate FluxCD
* Connect my cluster to GitHub using GitOps
* Prepare and deploy my first real application (Linkding)

**If it wasn’t in Git, it didn’t exist.**

---

## Raspberry Pi + Remote Management (Mindset Shift)
I’m running Kubernetes on a Raspberry Pi4 (ARM64), but I’m not treating it like a toy home lab. The cluster is remotely managed so it behaves like a cloud-hosted environment:

* **SSH access from anywhere**
* **kubectl works without local console access**
* **Git is the source of truth**

That mindset shift is important. The goal isn’t “it runs on my desk,” it’s operating discipline.

---

## k3s: Lightweight Kubernetes That Feels Real
Instead of Minikube or kind, I chose **k3s**.

**Why k3s?**
* ARM-friendly (perfect for Pi)
* Simple install
* Production-grade Kubernetes
* Minimal overhead

After install, the first win of the day:
`k get nodes`

Seeing my Pi show up as **Ready** never gets old.

---

## Fixing kubeconfig Permissions (Early Hiccup)
k3s stores its kubeconfig here: `/etc/rancher/k3s/k3s.yaml`. By default, that means root-only access — not ideal.

I copied it into my home directory and locked it down properly:

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $(id -u):$(id -g) ~/.kube/config
chmod 600 ~/.kube/config
```

After that, `k get nodes` just worked — clean and secure.

## Installing FluxCD (GitOps Begins)

With Kubernetes stable, it was time for GitOps. FluxCD turns Git into the single source of truth for cluster state.

Install:

```bash
curl -s https://fluxcd.io/install.sh | sudo bash
```

Preflight checks:

```bash
flux check --pre
```

Once those passed, the cluster was officially GitOps-capable.

## Bootstrapping Flux with GitHub

This is where things really clicked. I bootstrapped Flux directly into my GitHub repo: https://github.com/MrGuato/pi-cluster

```bash
flux bootstrap github \
  --owner=MrGuato \
  --repository=pi-cluster \
  --branch=main \
  --path=clusters/staging \
  --personal
```

Flux automatically:

- Installed all controllers
- Created secure GitHub auth
- Set up reconciliation loops
- Wired the cluster to Git as the source of truth

From this point forward: If it’s not committed, it doesn’t exist.

## Repo Structure (Designed for Scale)

I structured the repo with a clear separation of concerns:

```text
clusters/
└── staging/
    ├── flux-system/
    └── apps.yaml

apps/
├── base/
│   └── linkding/
└── staging/
    └── linkding/
```

This gives me:

- Clean separation between cluster config and apps
- Environment-specific overlays
- Auditable, reversible changes
- A structure that scales beyond a single Pi

## Deploying My First App: Linkding
For my first workload, I chose Linkding — a self-hosted bookmark manager.

Why Linkding?

- Real, useful application
- Stateful
- Simple enough to debug
- Exercises real Kubernetes concepts: Namespaces, Deployments, Services, and GitOps reconciliation.
- I added all manifests only in Git and let Flux do the work.

## Debugging Like Real GitOps (This Part Mattered)
Flux was running… but nothing was deploying. This was intentional friction - and a great learning moment.

What I learned:

- Flux can be READY=True and still apply nothing.

- Kustomization paths must point to valid, wired resources.

- YAML errors don’t always scream — sometimes they quietly block everything.


The actual issue? A typo in my Namespace manifest:

```yaml
piVersion: v1   # ❌ typo
```

Instead of:

```yaml
apiVersion: v1  # ✅ correct
```

Once fixed and committed, Flux immediately reconciled. That’s GitOps done right: No manual fixes, no kubectl drift. Just commit → reconcile → converge.

## Verifying the Deployment
Once Flux applied the fix:

```Bash
kubectl get ns
kubectl get pods -A
```
And there it was: linkding linkding-xxxxx Running

First real app deployed entirely via GitOps.

## Accessing the App (Port-Forwarding)
Correct command:

```bash
kubectl -n linkding port-forward pod/linkding-xxxxx 8080:9090
```

After that, http://localhost:8080 loaded the Linkding UI immediately. Next step will be adding a Service + Ingress so this doesn’t rely on pod names or port-forwarding.

## Why This Setup Matters (For Me)
This mirrors how real teams run Kubernetes:

- Git-driven infrastructure
- No snowflake clusters
- Auditable history
- Declarative state
- Automation-first mindset

Doing this on a Raspberry Pi proves you don’t need cloud spend to learn real DevOps / GitOps. One small cluster — done the right way.

Repo: https://github.com/MrGuato/pi-cluster

More to come!
