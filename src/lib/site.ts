import type { CollectionEntry } from "astro:content";

export const site = {
  name: "GitOps Notes",
  author: "Jonathan DeLeon",
  handle: "MrGuato",
  description:
    "Build logs, post-mortems and notes from a GitOps homelab, written by Jonathan DeLeon.",
  motto: "If it's not committed, it doesn't exist.",
  links: {
    github: "https://github.com/MrGuato",
    linkedin: "https://www.linkedin.com/in/jonathan-deleon-cism/",
    cloud: "https://cloud.mrcyberleon.org",
    source: "https://github.com/MrGuato/gitops-notes",
  },
};

/** Base path without a trailing slash, e.g. "/gitops-notes". */
export const base = import.meta.env.BASE_URL.replace(/\/$/, "");

/** Post dates are YAML dates parsed as UTC midnight, so format them in UTC. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function longDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Rough reading time at 200 words per minute. */
export function readingTime(body: string): number {
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

export type Post = CollectionEntry<"posts">;
export type Project = CollectionEntry<"projects">;

export function sortPosts(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => a.data.order - b.data.order);
}
