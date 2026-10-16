# Running the site in the k3s cluster

These manifests serve the GitOps Notes container in the pi-cluster behind a
Cloudflare Tunnel on a public hostname. The folder mirrors the pi-cluster
layout so it can be copied straight into that repo:

```text
deploy/k8s/apps/
  base/gitops-notes/        -> pi-cluster apps/base/gitops-notes/
    namespace.yaml          namespace with Pod Security Admission "restricted"
    deployment.yaml         2 nginx replicas, non-root, read-only root fs, probes, limits
    service.yaml            ClusterIP on 8080
    networkpolicy.yaml      nginx: ingress from cloudflared only, egress to DNS only
    pdb.yaml                PodDisruptionBudgets for nginx and cloudflared
    cloudflared.yaml        per-namespace tunnel, reads Secret cloudflared-tunnel
  staging/gitops-notes/     -> pi-cluster apps/staging/gitops-notes/
    kustomization.yaml      base plus the encrypted secret
    secret.yaml.example     shape of the tunnel secret, no real values
```

The hostname used throughout is `notes.deleontech.net`. To use another one,
change it in `secret.yaml`, set the `CLUSTER_SITE_URL` repository variable in
the gitops-notes repo to the matching `https://` URL, and rebuild the image.

## Why the hostname is public

Every other app in the cluster sits behind Cloudflare Access with email OTP.
A blog is meant to be read by anyone, so this hostname gets no Access policy.
The protection comes from the layers around the pod instead:

- The container serves static files only, answers GET and HEAD, runs nginx as
  uid 101 on a read-only root filesystem with every capability dropped, and
  sends a Content-Security-Policy with no inline scripts.
- The namespace enforces the restricted Pod Security profile.
- The NetworkPolicy lets only the cloudflared pods reach nginx and lets nginx
  reach nothing but cluster DNS. The cloudflared pods may reach the Cloudflare
  edge, DNS and nginx, and nothing in private address space.
- Cloudflare caches the whole site at the edge, runs Bot Fight Mode and rate
  limits the hostname, so a burst of traffic is absorbed before it reaches the
  home connection.

## Steps in the pi-cluster repo

### 1. Publish the image

Merge the gitops-notes change to `main`. The "Container image" workflow builds
`linux/amd64` and `linux/arm64` and pushes `ghcr.io/mrguato/gitops-notes` with
two tags: `sha-<short commit>` and `latest`.

The cluster pulls without an image pull secret, so the package must be public.
On GitHub open your profile, Packages, `gitops-notes`, Package settings, and
change the visibility to public. This is a one-time step.

Copy the `sha-` tag from the workflow run (the metadata step prints it) into
`apps/base/gitops-notes/deployment.yaml` in place of `sha-0000000`.

### 2. Create the tunnel

On a machine with `cloudflared` and access to the Cloudflare account:

```bash
cloudflared tunnel login
```

```bash
cloudflared tunnel create gitops-notes
```

Note the tunnel ID it prints. The credentials file lands in
`~/.cloudflared/<TUNNEL_ID>.json`.

### 3. Route the public hostname, with no Access application

```bash
cloudflared tunnel route dns gitops-notes notes.deleontech.net
```

This creates a proxied CNAME to `<TUNNEL_ID>.cfargotunnel.com`. Do not create
an Access application for it. In Zero Trust, open Access, Applications, and
confirm nothing there matches `notes.deleontech.net`, including wildcard
applications for the zone.

### 4. Copy the manifests and encrypt the secret

From the pi-cluster checkout, with `GITOPS_NOTES` pointing at this repo:

```bash
mkdir -p apps/base/gitops-notes apps/staging/gitops-notes
```

```bash
cp "$GITOPS_NOTES"/deploy/k8s/apps/base/gitops-notes/*.yaml apps/base/gitops-notes/
```

```bash
cp "$GITOPS_NOTES"/deploy/k8s/apps/staging/gitops-notes/kustomization.yaml apps/staging/gitops-notes/
```

```bash
cp "$GITOPS_NOTES"/deploy/k8s/apps/staging/gitops-notes/secret.yaml.example apps/staging/gitops-notes/secret.yaml
```

Edit `apps/staging/gitops-notes/secret.yaml`: paste the contents of
`~/.cloudflared/<TUNNEL_ID>.json` into `credentials.json`, and put the tunnel
ID into `config.yaml`. Then encrypt it in place with the cluster's SOPS config,
which lives under `clusters/staging/` and not at the repo root:

```bash
sops --config clusters/staging/.sops.yaml --encrypt --in-place apps/staging/gitops-notes/secret.yaml
```

Check that both values are encrypted before committing:

```bash
grep -c 'ENC\[' apps/staging/gitops-notes/secret.yaml
```

The count should be 2. Delete `~/.cloudflared/<TUNNEL_ID>.json` once the
encrypted file is committed, or move it somewhere outside any git checkout.

### 5. Add the Flux Kustomization

The Flux Kustomization `apps` in `clusters/staging/apps.yaml` already
reconciles `./apps/staging` with SOPS decryption, and Flux picks up any
subfolder that has its own `kustomization.yaml`. Commit the two new folders
and push:

```bash
git add apps/base/gitops-notes apps/staging/gitops-notes
```

```bash
git commit -m "feat: gitops-notes site behind a public cloudflare tunnel"
```

Then reconcile and check:

```bash
flux reconcile kustomization apps --with-source
```

```bash
kubectl -n gitops-notes get pods,svc,networkpolicy,pdb
```

```bash
kubectl -n gitops-notes logs deploy/cloudflared | grep -i registered
```

```bash
curl -sI https://notes.deleontech.net | grep -i -e '^HTTP' -e content-security-policy -e cf-cache-status
```

### 6. Cloudflare dashboard

All of this is on the zone, under the `deleontech.net` site.

Caching. Open Caching, Cache Rules, Create rule. Name it, match
`Hostname equals notes.deleontech.net`, set Cache eligibility to
"Eligible for cache", Edge TTL to "Use cache-control header if present,
bypass cache if not", and Browser TTL to "Respect origin TTL". Deploy. The
origin sends a one-year `Cache-Control` for `/_astro/` and five minutes for
pages, so the edge serves almost every request itself. A second
`curl -sI` of the hostname should show `cf-cache-status: HIT`.

Bot Fight Mode. Open Security, Bots, and turn Bot Fight Mode on. On the newer
dashboard it is under Security, Settings, Bot traffic.

Rate limiting. Open Security, WAF, Rate limiting rules, Create rule. Match
`Hostname equals notes.deleontech.net`, count by IP, allow 100 requests per 10
seconds, and block for 10 seconds when exceeded. Those are the limits the free
plan allows for its one rule. On the newer dashboard it is under Security,
Security rules, Create rule, Rate limiting rule.

Also confirm Always Use HTTPS is on under SSL/TLS, Edge Certificates. The
origin already sends Strict-Transport-Security.

## Updating the site

Merge a new post. The image workflow prints a new `sha-` tag. Change the tag
in `apps/base/gitops-notes/deployment.yaml`, commit, and Flux rolls it out
one replica at a time with `maxUnavailable: 0`, so the site stays up. Cached
pages refresh within five minutes, or purge the hostname under Caching,
Configuration, Purge Cache.

## Checking the manifests locally

```bash
kubectl apply --dry-run=client -k deploy/k8s/apps/base/gitops-notes
```
