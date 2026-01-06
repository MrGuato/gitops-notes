import { defineCollection, z } from "astro:content";

export const collections = {
  posts: defineCollection({
    schema: z.object({
      title: z.string(),
      date: z.date(),
      description: z.string(),
      hero: z.string().optional(), // store WITHOUT leading slash
    }),
  }),
};
