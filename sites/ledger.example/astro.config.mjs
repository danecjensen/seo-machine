import { defineSite } from "@seo-machine/kit";
import site from "./site.config.mjs";

export default defineSite(import.meta.url, site);
