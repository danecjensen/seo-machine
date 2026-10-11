// One "pages" collection per site: every Markdown file under src/content/.
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const faq = z.array(z.object({ q: z.string(), a: z.string() }));

export const pageSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1, "every page needs a meta description"),
  keyword: z.string().optional(),           // target phrase the SEO check looks for
  seo_title: z.string().optional(),         // replaces the templated <title>
  heading: z.string().optional(),           // replaces the <h1>
  nav_title: z.string().optional(),         // shorter name for breadcrumbs
  lede: z.string().optional(),
  date: z.coerce.date().optional(),         // makes a nested page a dated post
  updated: z.coerce.date().optional(),
  author: z.string().optional(),
  image: z.string().optional(),             // share image for this page
  image_alt: z.string().optional(),
  noindex: z.boolean().default(false),
  draft: z.boolean().default(false),
  canonical: z.string().url().optional(),
  type: z.enum(["page", "post", "list"]).optional(),
  cta: z.boolean().default(true),
  cta_title: z.string().optional(),
  toc: z.boolean().default(true),
  faq: faq.optional(),
  service: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    price: z.number().optional(),
    currency: z.string().default("USD"),
    area_served: z.union([z.string(), z.array(z.string())]).optional(),
  }).optional(),
}).strict();

export const collections = {
  pages: defineCollection({
    loader: glob({
      pattern: "**/*.md",
      base: "./src/content",
      generateId: ({ entry }) => entry.replace(/\.md$/, ""),
    }),
    schema: pageSchema,
  }),
};
