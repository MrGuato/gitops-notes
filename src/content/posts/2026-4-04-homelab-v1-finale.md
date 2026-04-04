---
title: "Homelab v1: From a Single Pi to a Production-Pattern Cluster"
date: 2026-04-04
description: "Reflecting on four months of building a mixed-architecture Kubernetes homelab from scratch"
hero: "posts/2026-04-04/homelab-v1-hero.svg"
tags: ["kubernetes", "homelab", "gitops", "devops", "career", "reflection"]
---
 
Five months ago I plugged a Raspberry Pi 4 into my network and ran `curl -sfL https://get.k3s.io | sh -`. Today I have a four-node, mixed-architecture Kubernetes cluster running ARM64 and x86_64 side by side, managed entirely through Git, with distributed storage replicating across a 2TB SSD and a Pi.
 
This is the v1 milestone post. Not because the cluster is finished. It will never be finished. But because the foundation is solid enough to call it a platform rather than a project.
 
## What Exists Today
 
The cluster runs k3s v1.34.6 across three Raspberry Pi 4 nodes (8GB, 4GB, 2GB) running Debian and one Lenovo ThinkStation (i5, 8GB DDR5) running Red Hat Enterprise Linux 10.1. Every change is committed to a single Git repository and reconciled by FluxCD.
 
The infrastructure stack: FluxCD for GitOps, SOPS with age for secret encryption, Cloudflare Tunnels for zero-trust ingress with no open ports, Longhorn for distributed block storage, kube-prometheus-stack for monitoring, Velero for automated backups, and Renovate Bot for dependency updates.
 
The services running on top: Vikunja for task management, Linkding for bookmarks, Obsidian LiveSync for knowledge sync across devices, Grafana for dashboards, and a custom status dashboard at status.deleontech.net showing live cluster metrics.
 
All of it is open source. All of it is documented.
 
## What I Actually Learned
 
The tools are the least interesting part. Anybody can follow a tutorial to deploy Linkding on Kubernetes. The learning happens when things break in ways the tutorial never mentioned.
 
CouchDB crashed silently on ARM64 because the securityContext was too restrictive. No logs. No error messages. Just a pod restarting forever. The fix was removing the securityContext entirely and configuring CORS through the API instead of a ConfigMap mount. That took hours to figure out and taught me more about container runtime behavior than any documentation could.
 
Longhorn's managers crash-looped on three nodes because open-iscsi was not installed. I had prepared kubethink (RHEL) with the package during the image build, but forgot the Pi nodes needed it too. The error message was clear once I looked at the logs, but I had to learn to look at the right logs.
 
A single misformatted YAML line in Velero's helmrelease blocked the entire infrastructure kustomization for days. Longhorn could not deploy, Renovate could not deploy, Velero could not deploy. All because of one line where two YAML keys were concatenated. I did not notice because I was not monitoring that kustomization.
 
An ARM64 container image landed on the x86_64 ThinkStation and failed with "no match for platform in manifest." That is how I learned that mixed-architecture clusters require explicit scheduling awareness for every deployment.
 
The Samsung T7 Shield would not power on when connected to the Raspberry Pi because the USB bus could not deliver enough current. The drive blinked blue for five seconds and died. Moving it to the ThinkStation solved the problem immediately.
 
I jumped the k3s control plane from v1.32 to v1.34, skipping v1.33 entirely. Kubernetes version skew policy says not to do this. It worked because my etcd membership was consistent. I would not do it again.
 
Every one of these failures is in the repository. Every one is in the blog. I believe in documenting the debugging process alongside the happy path. The mistakes are the curriculum.
 
## What Changed About How I Think
 
Before this project, I understood Kubernetes conceptually. I could read a deployment manifest. I knew what a PVC was.
 
After this project, I understand Kubernetes operationally. I know what happens when a node loses power and how storage failover actually works. I know how SOPS decryption interacts with Flux reconciliation. I know why mixed-architecture scheduling matters and how to debug it when it fails. I know the difference between what a tutorial shows you and what production actually looks like.
 
The homelab is not a substitute for professional experience. But it removed the gap between "I have read about this" and "I have done this and here is where it broke."
 
## Skills That Did Not Exist Five Months Ago
 
These are things I can now speak to concretely, with examples and debugging stories, that I could not before starting this project.
 
- Kubernetes cluster operations across heterogeneous hardware. 
- GitOps-first workflow with FluxCD, Kustomize overlays, and encrypted secrets. 
- Distributed block storage with Longhorn including replica scheduling, custom disk paths, and node failure recovery. 
- Backup and disaster recovery with Velero. 
- Container image builds and multi-architecture awareness. 
- YAML debugging at scale where one syntax error cascades across an entire infrastructure layer.
 
## What Is Next
 
v1 is the foundation. The roadmap for v2 includes migrating existing workloads from local-path to Longhorn PVCs, deploying Audiobookshelf as a media server, setting up a Cloudflare Tunnel for Grafana so it is accessible externally, building out Grafana dashboards and alert rules, and exploring Longhorn's backup-to-S3 capability to integrate with Velero.
 
 
## The Principle
 
Every decision in this cluster comes back to one rule:
 
If it is not in Git, it does not exist.
 
This is not just about version control. It is a mindset. It means no imperative commands for production changes. It means secrets are encrypted before they touch the repository. It means the cluster can be destroyed and rebuilt from a single `flux bootstrap` command plus the age key. It means every change has an author, a timestamp, and a reason.
 
That is what a production mindset on homelab hardware actually looks like.
 
The cluster is live at [status.deleontech.net](https://status.deleontech.net). The source is at [github.com/MrGuato/pi-cluster](https://github.com/MrGuato/pi-cluster). The blog documents the full journey at [mrguato.github.io/gitops-notes](https://mrguato.github.io/gitops-notes).

*Built with ❤️ by Jonathan - If it is not in Git, it does not exist.*