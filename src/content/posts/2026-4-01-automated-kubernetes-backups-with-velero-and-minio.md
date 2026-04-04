---
title: "Automated Kubernetes Backups with Velero and MinIO"
date: 2026-04-01
description: "Setting up Velero for automated daily backups on a k3s homelab with MinIO as the S3-compatible backend"
hero: "posts/2026-04-01/velero-hero.svg"
tags: ["kubernetes", "velero", "backup", "gitops", "fluxcd", "homelab"]
---
 
GitOps gives you a reproducible cluster. Velero gives you the data that Git cannot store.
 
FluxCD can rebuild every deployment, service, and secret from the repository. What it cannot rebuild is the contents of a PVC. The bookmarks saved in Linkding, the tasks in Vikunja's Postgres database, the Obsidian vault synced through CouchDB. If the SD card in kubepi dies tomorrow, flux bootstrap brings back the infrastructure. Velero brings back the data.
 
This post covers how I deployed Velero on my k3s cluster using FluxCD and MinIO as the storage backend.
 
## What Velero Actually Does
 
Velero runs as a deployment in the cluster. It watches for Backup resources, snapshots Kubernetes objects as JSON, optionally backs up PVC data through a node agent, and ships everything to an S3-compatible storage backend. A Schedule resource automates this on a cron cadence.
 
The restore path is the inverse. Point Velero at a backup, and it recreates the resources and data in the cluster. It is not a replacement for GitOps. It is a complement. Git holds the desired state. Velero holds the runtime state.
 
## The Stack
 
Velero is deployed via a HelmRelease in `infrastructure/controllers/base/velero/`, following the same base/staging overlay pattern as everything else in the cluster. The Helm chart comes from the VMware Tanzu repository.
 
MinIO runs separately on the network as the S3-compatible object store. Velero talks to it using the AWS plugin, which handles the S3 API compatibility.
 
The credentials for MinIO are stored as a SOPS-encrypted secret in `infrastructure/controllers/staging/velero/secret.yaml`. FluxCD decrypts them at reconcile time. No plaintext ever touches Git.
 
## Configuration
 
The HelmRelease values define the backup schedule, retention policy, and storage target.
 
The schedule runs at 2am daily with a 7-day retention window. Velero backs up the namespaces that hold stateful data: flux-system, velero, monitoring, linkding, obsidian-sync, and vikunja. Volume snapshots are disabled in favor of file-level backup through the node agent, which works better with local-path PVCs on the Pi.
 
The BackupStorageLocation points to a MinIO bucket called `pi-cluster-backups` using the AWS plugin with S3 path-style addressing. The node agent runs as a DaemonSet with broad tolerations so it can access PVC data on any node.
 
## What Broke
 
The Velero HelmRelease had a YAML formatting error that I did not catch for over a week. Two keys ended up on the same line:
 
```yaml
              - vikunja    initContainers:
```
 
This should have been:
 
```yaml
              - vikunja
    initContainers:
```
 
The result was a `MalformedYAMLError` on line 17 of the helmrelease. But the real damage was broader. Because Velero, Longhorn, and Renovate all live under `infrastructure-controllers`, a single broken file in that kustomization blocked every sibling resource from deploying. Longhorn could not deploy because Velero's YAML was broken.
 
Flux showed `infrastructure-controllers` as `False` with the error, but I was not watching that kustomization closely. The lesson is simple: check all kustomization statuses regularly, not just the ones you are actively working on. A broken file anywhere in the tree can cascade.
 
## Validating Before Committing
 
After this experience, I now check YAML before pushing:
 
```bash
kubectl kustomize infrastructure/controllers/staging/
```
 
If that exits clean, the YAML is valid. If not, Flux will reject it the same way. Five seconds of validation saves days of silent failures.
 
## The Result
 
Velero runs a daily backup at 2am, retains 7 days of history, and stores everything in MinIO. If a PVC gets corrupted or I accidentally delete a namespace, the data is recoverable. Combined with FluxCD handling the infrastructure state, the cluster has two independent recovery paths: Git for configuration, Velero for data.
 
The full configuration is in the [pi-cluster repository](https://github.com/MrGuato/pi-cluster) under `infrastructure/controllers/base/velero/`.
 
*Built with ❤️ by Jonathan - If it is not in Git, it does not exist.*