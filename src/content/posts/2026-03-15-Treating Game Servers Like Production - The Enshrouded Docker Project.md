---
title: "Treating Game Servers Like Production: The Enshrouded Docker Project"
date: 2026-03-15
description: "Enshrouded Docker Container Project"
hero: "posts/2026-03-15/enshrouded_docker_blog_hero.svg"
tags: ["docker", "devops", "gaming", "self-hosted"]
---

# Treating Game Servers Like Production: The Enshrouded Docker Project

> *"Treat game servers like production services."*

That's the philosophy behind `enshrouded-docker`, a containerized, auto-updating dedicated server for the survival game **Enshrouded**, built with the same DevOps rigor you'd bring to any real workload. This post walks through why this project exists, how the image is structured, the challenges we hit along the way (Wine, I'm looking at you), and what it feels like to apply production-grade thinking to something gamers just want to *work*.

---

## The Problem: Game Servers Are a Pain

If you've ever tried to host a dedicated game server for friends, you know the cycle:

1. Download the server binary manually
2. Figure out the right ports, configs, and launch flags
3. It works — until the game updates
4. Now nothing works and you spend your weekend debugging instead of playing

Most existing Enshrouded server setups lean into this pain:

- **Manual installs** that drift over time
- **Docker images** that go stale the moment Steam ships a patch
- **Containers that require a full rebuild** just to get the latest game version
- **Root containers** with no clear persistence strategy or brittle startup logic

We wanted something better. Something you could `docker compose up` and forget about.

---

## The Core Idea: Immutable Container, Mutable Game

The central design decision is deceptively simple:

> **The container is immutable. The game server is not.**

Instead of baking a specific Enshrouded server version into the Docker image — which would go stale almost immediately — the image ships **SteamCMD + Wine** and pulls the **latest Enshrouded Dedicated Server** (Steam AppID `2278520`) at runtime, every time the container starts.

```
┌─────────────────────────┐
│ Docker Image (Immutable)│
│ • Ubuntu LTS            │
│ • SteamCMD              │
│ • Wine (Windows server) │
│ • Entrypoint logic      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Runtime Update (Auto)   │
│ steamcmd                │
│ +app_update 2278520     │
│ validate                │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Persistent Data Volume  │
│ • World saves           │
│ • Logs                  │
│ • Server config         │
└─────────────────────────┘
```

This approach means:

- No broken `latest` tags
- No manual update steps when Keen Games ships a patch
- No rebuild pipelines triggered by a Steam update
- The server just restarts and self-heals to the current version

---

## Why Docker Is the Right Tool Here

Docker provides **reproducibility** — every server instance starts from the same known-good environment: same OS, same dependency versions, same startup sequencing. The classic "it worked on my machine" problem evaporates.

The container follows **immutable infrastructure** principles: no in-place OS changes, no snowflake configurations, no configuration drift. The image is the contract. If you need to change the environment, you change the image definition and redeploy. That's it.

Persistence is handled cleanly through **volume separation**:

```
data/
 ├─ savegame/       ← world data
 ├─ logs/           ← server logs
 ├─ enshrouded_server.json  ← config
```

The world lives outside the container. You can rebuild the image, switch tags, or migrate hosts without losing anyone's progress. The image handles *runtime*; volumes handle *state*. Those are different concerns and they should live separately.

---

## Building the Image

The Dockerfile is built on **Ubuntu LTS** as the base — stable, well-supported, and a natural home for SteamCMD. Key layers include:

- Adding the `i386` architecture for SteamCMD compatibility
- Installing Wine and its dependencies (more on this in a moment)
- Installing Xvfb for headless display support (required by Wine)
- Creating a non-root `steam` user to run the server
- Copying in the entrypoint script

The `entrypoint.sh` does the heavy lifting at runtime:

1. Runs `steamcmd +login anonymous +app_update 2278520 validate +quit`
2. Generates a default `enshrouded_server.json` config if one doesn't exist
3. Launches the server binary via Wine under Xvfb

The whole thing is driven by environment variables so operators can tune behavior without touching any files:

```yaml
environment:
  - UPDATE_ON_START=1
  - SERVER_NAME=My Enshrouded Server
  - SERVER_SLOTS=16
```

---

## The CI/CD Pipeline

The repo includes a **GitHub Actions workflow** (`docker-ghcr.yml`) that automates the full build and publish cycle. It triggers on:

- Pushes to `main`
- A scheduled daily run (to pick up any base image updates)
- Manual dispatch for on-demand releases

Images are published to **GitHub Container Registry (GHCR)** with a multi-tag strategy:

| Tag | Purpose |
|---|---|
| `latest` | Always the most recent stable build |
| `sha-<commit>` | Pinnable by exact commit |
| `YYYYMMDD` | Date-based pinning |
| `v1.0.0` (optional) | SemVer for explicit versioning |

This mirrors how production container workflows operate. You can pin to a date tag for stability, track `latest` for rolling updates, or reference a specific SHA for air-gapped or audited environments.

---

## The Challenges: Wine Is a Beast

Let's be direct: **Wine is the hardest part of this project**, and it caused the most iteration.

### Why Wine at All?

Enshrouded's dedicated server ships as a **Windows binary**. Keen Games does not provide a native Linux server. So to run it on Linux (which is where Docker lives), you need Wine to translate Windows API calls into Linux system calls. This is not optional — it's a fundamental constraint of the game.

### What We Ran Into

**Headless display requirements.** Wine often needs an X display even when nothing should be rendering. Without it, processes would crash silently or hang indefinitely. The fix was Xvfb — a virtual framebuffer that gives Wine a fake display to talk to.

```bash
Xvfb :1 -screen 0 1024x768x16 &
export DISPLAY=:1
```

**Architecture mismatches.** SteamCMD is a 32-bit application on a 64-bit system. Getting the right `i386` libraries installed without conflicting with the Wine 64-bit environment took careful dependency ordering in the Dockerfile.

**Wine initialization timing.** On first run, Wine needs to initialize its prefix (`WINEPREFIX`). This takes time and can fail silently if not handled correctly. We added prefix initialization as an explicit step with proper error handling rather than letting it happen implicitly.

**Startup sequencing.** The entrypoint needed to handle: Xvfb start → Wine prefix init → SteamCMD update → server launch, in that exact order, with each step gated on the success of the previous one. Early versions had race conditions where the server would attempt to launch before the Wine environment was ready.

### The Lesson

Wine works. But you have to be explicit about every assumption it makes. Don't let it initialize lazily, drive every step deliberately and check exit codes. The container is more resilient for it.

---

## Making Life Easier for Gamers

The whole point of this project is that **the person running the server shouldn't have to be a DevOps engineer** to keep it running.

### What "Set and Forget" Actually Means

With `restart: unless-stopped` in the Compose file and `UPDATE_ON_START=1` in the environment, the server:

- Comes back automatically after a host reboot
- Updates itself to the latest game version on every restart
- Regenerates a missing config file if it's lost
- Runs as a non-root user with only the UDP ports it needs exposed

For a group of friends who just want to play, this is the difference between having a server admin who spends weekends on upkeep versus having a server that just works.

### Quick Start

```bash
# Pull the image
docker pull ghcr.io/mrguato/enshrouded-docker:latest

# Stand it up
docker compose up -d
```

That's the entire operational surface for end users. One command to pull. One command to run. No Steam account needed. No manual binary downloads. No "which version am I on?"

---

## Security Considerations

Even for a game server, basic hardening matters:

- **Non-root user**: The server runs as `steam`, not `root`
- **Minimal base OS**: Ubuntu LTS with only what's needed
- **No privileged mode**: Standard Docker networking, no `--privileged`
- **Minimal port exposure**: Only the two UDP ports Enshrouded requires
- **No inbound management interfaces**: No SSH, no web UI, no API

This is table stakes for any container, but it's worth calling out because most "game server Docker images" on Docker Hub skip all of it.

---

## Reflections: DevOps Thinking Applied to Gaming

There's something genuinely interesting about applying production DevOps patterns to a hobby project. The constraints are different, your SLA is "my friends want to play on Friday night" rather than "five nines uptime", but the patterns hold.

**Immutable infrastructure** is just as useful when the mutable thing is a world save as when it's a database. **Separation of concerns** between the runtime environment and persistent state is just as clean when the state is a survival game world as when it's user records. **CI/CD** for container publishing is just as valuable when the consumers are friends with a `docker compose` file as when they're a fleet of production VMs.

The real takeaway is that the muscle memory you build applying these patterns to something low-stakes, a game server, a homelab, a weekend project, is exactly the same muscle memory that scales to real infrastructure. The tooling is identical. The thinking is identical.

Build it like it matters, even when the stakes are low. Especially then.

---

## Resources

- **Repository**: [github.com/MrGuato/enshrouded-docker](https://github.com/MrGuato/enshrouded-docker)
- **Project Page**: [mrguato.github.io/enshrouded-docker](https://mrguato.github.io/enshrouded-docker/)
- **GHCR Image**: `ghcr.io/mrguato/enshrouded-docker:latest`
- **Enshrouded Steam AppID**: `2278520`
- **License**: MIT

---

*Built with ❤️ by Jonathan — because even game servers deserve good infrastructure.* 
