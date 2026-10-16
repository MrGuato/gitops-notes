import { defineCollection, z } from "astro:content";

export const collections = {
  posts: defineCollection({
    schema: z.object({
      title: z.string(),
      date: z.date(),
      description: z.string(),
      hero: z.string().optional(), // store WITHOUT leading slash
      tags: z.array(z.string()).optional(),
    }),
  }),
  projects: defineCollection({
    schema: z.object({
      name: z.string(),
      description: z.string(),
      status: z.enum(["active", "stable", "archived", "planned"]).default("active"),
      repo: z.string().url().optional(),
      link: z.string().url().optional(),
      stack: z.array(z.string()).default([]),
      started: z.string().optional(), // free text, e.g. "2025-12"
      order: z.number().default(100),
    }),
  }),
};
