---
title: "Shipping Renovate Bot to a FluxCD GitOps Homelab"
date: 2026-03-28
description: "How I wired up Renovate Bot as a Kubernetes CronJob on my Raspberry Pi k3s cluster — managed entirely through FluxCD GitOps, with SOPS-encrypted secrets and a GitHub PAT that never touches plaintext in Git."
hero: "posts/2026-03-28/renovate-bot-gitops.svg"
tags: ["kubernetes", "gitops", "flux", "sops", "renovate", "cronjob", "homelab", "kustomize"]
---
 
## The Goal
 
One of the things I wanted from this homelab from the start was automatic dependency updates. Not clicking through GitHub PRs manually, not noticing weeks later that a container image is three major versions behind. Renovate Bot watches your repo, finds stale image tags and Helm chart versions, and opens PRs to fix them — automatically, on a schedule.
 
In a GitOps cluster, that means deploying Renovate as a Kubernetes CronJob, encrypting the GitHub PAT it needs, and wiring the whole thing through Flux so it's committed, auditable, and reproducible. Here's exactly how I did it — mistakes included.
 
---
 
## The Architecture
 
Renovate runs as a CronJob in a dedicated `renovate` namespace. Every hour, Kubernetes spins up a pod, Renovate authenticates to GitHub using a Personal Access Token stored as a SOPS-encrypted Secret, scans the repo, and exits. No long-running daemon, no persistent storage needed.
 
The config lives entirely in the GitOps tree:
 
```
infrastructure/
└── controllers/
    ├── base/
    │   └── renovate/
    │       ├── namespace.yaml
    │       ├── cronjob.yaml
    │       ├── configmap.yaml
    │       ├── renovate-container-env.yaml   ← SOPS-encrypted PAT
    │       └── kustomization.yaml
    └── staging/
        ├── kustomization.yaml                ← wires renovate into Flux
        └── renovate/
            └── kustomization.yaml            ← points at base
```
 
And a `renovate.json` at the repo root tells Renovate what to scan:
 
```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "kubernetes": {
    "fileMatch": ["\\.yaml$"]
  }
}
```
 
---
 
## Step 1: The Namespace
 
```yaml
# infrastructure/controllers/base/renovate/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: renovate
```
 
Simple. Every app gets its own namespace.
 
---
 
## Step 2: The ConfigMap
 
Non-sensitive config goes in a ConfigMap — platform, git author, autodiscover off (we're explicitly targeting one repo):
 
```yaml
# infrastructure/controllers/base/renovate/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: renovate-configmap
  namespace: renovate
data:
  RENOVATE_AUTODISCOVER: "false"
  RENOVATE_GIT_AUTHOR: "Renovate Bot <bot@renovateapp.com>"
  RENOVATE_PLATFORM: "github"
```
 
---
 
## Step 3: The Secret
 
The GitHub PAT goes into a SOPS-encrypted Secret. The workflow:
 
```bash
# 1. Render the manifest without touching the cluster
kubectl create secret generic renovate-container-env \
  --from-literal=RENOVATE_TOKEN=<your-pat> \
  --namespace=renovate \
  --dry-run=client \
  -o yaml > infrastructure/controllers/base/renovate/renovate-container-env.yaml
 
# 2. Encrypt in place — only the data fields, metadata stays readable
export AGE_PUBLIC=<your-age-public-key>
sops --age=$AGE_PUBLIC \
  --encrypt \
  --encrypted-regex '^(data|stringData)$' \
  --config clusters/staging/.sops.yaml \
  --in-place infrastructure/controllers/base/renovate/renovate-container-env.yaml
```
 
The `--config clusters/staging/.sops.yaml` flag is not optional. My `.sops.yaml` lives inside `clusters/staging/`, not at the repo root. Without the explicit config path, SOPS can't find the age recipient and fails with a cryptic "config file not found" error.
 
---
 
## Step 4: The CronJob
 
```yaml
# infrastructure/controllers/base/renovate/cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: renovate
  namespace: renovate
spec:
  schedule: "@hourly"
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: renovate
              image: renovate/renovate:latest
              args:
                - MrGuato/pi-cluster
              envFrom:
                - secretRef:
                    name: renovate-container-env
                - configMapRef:
                    name: renovate-configmap
          restartPolicy: Never
```
 
`concurrencyPolicy: Forbid` means if a run is still going when the next one fires, the new one is skipped. Sensible for a homelab repo where scans finish in seconds.
 
---
 
## Step 5: Kustomize Wiring
 
Every layer needs an explicit `kustomization.yaml`. Kustomize never auto-discovers subdirectories — if it's not in `resources:`, it doesn't exist.
 
Base:
```yaml
# infrastructure/controllers/base/renovate/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - namespace.yaml
  - renovate-container-env.yaml
  - configmap.yaml
  - cronjob.yaml
```
 
Staging overlay (just points at base, no patches needed):
```yaml
# infrastructure/controllers/staging/renovate/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: renovate
resources:
  - ../../base/renovate
```
 
Staging parent (wires the renovate subdirectory into Flux's view):
```yaml
# infrastructure/controllers/staging/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - renovate
```
 
---
 
## What Actually Broke (Everything, In Order)
 
This took several rounds of debugging. Here's the honest account.
 
### Bug 1: `resource:` instead of `resources:`
 
Both `kustomization.yaml` files had `resource:` (singular) instead of `resources:` (plural). Kustomize silently ignores unknown keys — it doesn't error, it just processes an empty resource list and creates nothing. The namespace never appeared, no error was shown, Flux reported `Ready: True` against thin air.
 
The fix is obvious once you see it. The lesson is to always verify with `kubectl get ns` after reconciliation, not just `flux get kustomizations`.
 
### Bug 2: `secrets.yaml` ghost entry
 
The base `kustomization.yaml` listed both `secrets.yaml` and `renovate-container-env.yaml`. The file was always named `renovate-container-env.yaml` — `secrets.yaml` was a leftover from an earlier draft. Kustomize tried to find it, failed, and the full error surfaced:
 
```
accumulating resources: accumulation err='accumulating resources from 'secrets.yaml':
open /tmp/.../infrastructure/controllers/base/renovate/secrets.yaml:
no such file or directory'
```
 
Removed the ghost entry, problem gone.
 
### Bug 3: The staging parent kustomization didn't exist
 
The Flux Kustomization CR pointed at `infrastructure/controllers/staging`. That directory had a `renovate/` subdirectory, but no `kustomization.yaml` at the `staging/` level itself. Flux had nothing to read. The subdirectory was simply invisible.
 
Created `infrastructure/controllers/staging/kustomization.yaml` listing `- renovate` under `resources:` and the chain was complete.
 
### Bug 4: Git rebase collision
 
35 commits had accumulated on remote while local work was in progress. A `git pull --rebase` caused a conflict on `readme.md` because both sides had modified it. Resolved by taking the remote version (`git checkout --theirs readme.md`), marking resolved, and continuing the rebase.
 
---
 
## Confirming It Works
 
After all fixes were committed and pushed:
 
```bash
flux reconcile source git flux-system
kubectl get ns
# renovate   Active   ...
 
kubectl get cronjob -n renovate
# NAME       SCHEDULE   SUSPEND   ACTIVE   LAST SCHEDULE
# renovate   @hourly    False     0        <none>
 
# Trigger a manual run
kubectl create job renovate-manual --from=cronjob/renovate -n renovate
 
# Watch the logs
kubectl logs -n renovate -l job-name=renovate-manual -f
# INFO: Renovate started
# INFO: Repository started
# ...
# INFO: Branch renovation complete
```
 
Renovate authenticated, scanned the repo, and finished cleanly. The first automated PRs will open on the next hourly tick.
 
---
 
## Key Takeaways
 
**`resources:` is plural.** Always. Kustomize won't tell you if you get it wrong.
 
**Every directory in the chain needs its own `kustomization.yaml`.** If `staging/` doesn't have one listing its subdirectories, those subdirectories don't exist from Flux's perspective.
 
**`--config` is required when `.sops.yaml` isn't at the repo root.** My cluster keeps it at `clusters/staging/.sops.yaml`. Forgetting this flag produces a confusing error that looks like a key problem but is actually a path problem.
 
**`flux get kustomizations` is not the full picture.** Always verify what actually landed in the cluster with `kubectl get ns` and `kubectl get all -n <namespace>`.
 
---
 
## Repo
 
All manifests for this setup live at [github.com/MrGuato/pi-cluster](https://github.com/MrGuato/pi-cluster).
 
*Built with ❤️ by Jonathan — If it is not in Git, it does not exist.*