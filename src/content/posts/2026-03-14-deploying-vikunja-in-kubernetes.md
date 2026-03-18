---
title: "Deploying Vikunja on a Raspberry Pi k3s Cluster with FluxCD and Cloudflare Tunnels"
date: 2026-03-14
description: "GitOps on a Raspberry Pi k3s cluster with FluxCD, and my second app: Vikunja."
hero: "posts/2026-03-14/03.14.26.hero.svg"
tags: ["kubernetes", "gitops", "k3s", "fluxcd", "cloudflare", "self-hosted"]
---
 
I have been running a Raspberry Pi 4 as a single-node k3s cluster managed entirely with FluxCD and GitOps principles. The idea is simple: if it is not committed to Git, it does not exist on the cluster. No manual kubectl apply for workloads, no configuration drift, just Git as the source of truth.
 
This post walks through how I deployed Vikunja, a self-hosted todo and project management app, on that cluster using the same base/overlay Kustomize pattern I use for everything else, exposed publicly through a Cloudflare tunnel with Zero Trust access control in front of it.
 
## The Stack
 
- Raspberry Pi 4 (8GB, ARM64)
- k3s as the Kubernetes distribution
- FluxCD for GitOps reconciliation
- SOPS with age encryption for secrets management
- Cloudflare Tunnel for external access with no open ports
- Cloudflare Zero Trust Access for authentication
 
## Repository Structure
 
My repo follows a base/overlay pattern. Base holds the environment-neutral definitions with no namespace, no secrets, no environment-specific config. The staging overlay sets the namespace, pulls in secrets, and adds the Cloudflare tunnel deployment. Flux watches the staging path and auto-discovers any subfolder with a kustomization.yaml.
 
```
apps/
  base/vikunja/
    namespace.yaml
    configmap.yaml
    pvc.yaml
    postgres.yaml
    deployment.yaml
    service.yaml
    kustomization.yaml
 
  staging/vikunja/
    kustomization.yaml
    secret.yaml
    cloudflare.yaml
```
 
## Why Vikunja
 
Vikunja ships as a single container that serves both the API and the web frontend since version 0.22. No separate frontend deployment needed. It supports PostgreSQL, has a clean web UI, and the official image publishes a native linux/arm64 layer so it runs without any platform workarounds on the Pi.
 
## PostgreSQL on ARM64
 
The official postgres alpine image includes an arm64 layer so there is nothing special to configure there. I did tune two postgres flags specifically for the Pi:
 
```
shared_buffers=128MB
max_connections=50
```
 
These keep memory usage reasonable on hardware where every megabyte matters when you are running multiple workloads. The deployment also uses a Recreate strategy rather than RollingUpdate because the PVC is ReadWriteOnce, meaning only one pod can mount it at a time. A rolling update would try to start the new pod before stopping the old one and both would fight over the volume.
 
## Secrets with SOPS
 
Secrets are written in plain YAML locally, encrypted with sops before committing, and Flux decrypts them on the cluster using the age private key stored as a Kubernetes secret in the flux-system namespace. The encrypted files are safe to commit to a public or private repository because without the private key they are useless.
 
The important thing to remember is that kubectl does not understand SOPS. Only Flux does. If you try to kubectl apply an encrypted secret file directly, Kubernetes will reject it because it sees the sops metadata fields as unknown fields on the Secret object. Let Flux handle secrets. That is the whole point of the setup.
 
## Cloudflare Tunnel
 
Rather than exposing a port on my router or dealing with dynamic DNS, I use Cloudflare Tunnel. Two cloudflared pods run inside the cluster and dial outbound to the Cloudflare edge. When a request comes in for vikunja.deleontech.net, Cloudflare routes it through the tunnel to the pods, which forward it to the vikunja Kubernetes service by internal DNS name.
 
Two replicas of cloudflared means if one pod restarts, the other keeps the tunnel alive. Cloudflare load balances across both connections automatically.
 
## Zero Trust Access
 
After getting the app running I locked it down with Cloudflare Zero Trust Access. Anyone hitting the domain now gets a Cloudflare login page before the request ever reaches my cluster. I configured it to send a one-time PIN to my email address. The request only reaches Vikunja after authentication. Everything else gets blocked at the edge.
 
This is genuinely one of the better security decisions you can make for a homelab. The app never needs to handle its own authentication for external access because Cloudflare handles it first.
 
## What I Learned
 
Debugging a deployment like this across SOPS, Flux, Kubernetes secrets, and Cloudflare involves a lot of moving parts. The most useful commands when things are broken are:
 
```bash
# What does Flux think went wrong
flux describe kustomization apps
 
# What is happening inside a pod
kubectl logs -n vikunja -l app=vikunja
 
# What is the cluster actually storing in a secret right now
kubectl get secret tunnel-credentials -n vikunja \
  -o jsonpath='{.data.credentials\.json}' | base64 -d
 
# Force Flux to reconcile immediately instead of waiting
flux reconcile kustomization apps --with-source
```
 
The cluster state and the Git state can drift when you are debugging. kubectl apply bypasses Flux and can leave resources in a state that does not match your repository. For secrets specifically, always delete and let Flux recreate rather than trying to patch them manually.
 
## The Result
 
Four pods, all running, total idle memory footprint around 350MB on the Pi. Vikunja is accessible at my domain, locked behind Cloudflare Zero Trust, data persisted to local-path storage on the Pi's disk, and the entire configuration lives in Git.
 
If the Pi dies and I rebuild k3s, I run flux bootstrap and everything comes back. That is what a production mindset on homelab hardware actually looks like.
 
The full repository is at [github.com/MrGuato/pi-cluster](https://github.com/MrGuato/pi-cluster).
