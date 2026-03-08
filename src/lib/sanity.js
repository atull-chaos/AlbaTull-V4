/**
 * Sanity CMS Client — Alba Tull Portfolio
 *
 * Provides read access to the Sanity dataset for photos, categories,
 * and site settings. Falls back to build cache → local data when Sanity
 * is unavailable (e.g. during local dev without tokens).
 *
 * Data priority:  1) Live Sanity API  →  2) Build cache (.sanity-cache.json)  →  3) Local photos.js
 */
import { createClient } from '@sanity/client';
import imageUrlBuilder from '@sanity/image-url';
import { readCache, writeCache } from './sanity-cache.js';

// ── Client ─────────────────────────────────────────────────────────
export const client = createClient({
  projectId: import.meta.env.SANITY_PROJECT_ID || 'vo1f0ucj',
  dataset:   import.meta.env.SANITY_DATASET   || 'production',
  apiVersion: import.meta.env.SANITY_API_VERSION || '2024-01-01',
  token:     import.meta.env.SANITY_READ_TOKEN || '',
  useCdn:    true,   // edge-cached reads (fast)
  requestTagPrefix: 'astro',
  timeout:   5000,   // 5s timeout — fail fast, fall back to cache
});

// ── Image URL Builder ──────────────────────────────────────────────
const builder = imageUrlBuilder(client);

/**
 * Generate an optimised image URL from a Sanity image reference.
 * Usage:  urlFor(photo.image).width(800).url()
 */
export function urlFor(source) {
  return builder.image(source);
}

// ── GROQ Queries ───────────────────────────────────────────────────

/**
 * Fetch all photos, ordered by category then title.
 * Returns: { _id, title, slug, description, category->{name,slug},
 *            image, audio, video, featured, metadata }
 */
export async function getAllPhotos() {
  return client.fetch(`
    *[_type == "photo"] | order(category->name asc, title asc) {
      _id,
      title,
      "slug": slug.current,
      description,
      category->{name, "slug": slug.current},
      image,
      audio,
      video,
      featured,
      metadata
    }
  `);
}

/**
 * Fetch a single photo by its slug.
 */
export async function getPhotoBySlug(slug) {
  return client.fetch(`
    *[_type == "photo" && slug.current == $slug][0] {
      _id,
      title,
      "slug": slug.current,
      description,
      category->{name, "slug": slug.current},
      image,
      audio,
      video,
      featured,
      metadata,
      "related": *[_type == "photo" && category._ref == ^.category._ref && _id != ^._id][0...6] {
        _id, title, "slug": slug.current, image, category->{name, "slug": slug.current}
      }
    }
  `, { slug });
}

/**
 * Fetch all categories with photo count.
 */
export async function getAllCategories() {
  return client.fetch(`
    *[_type == "category"] | order(order asc, name asc) {
      _id,
      name,
      "slug": slug.current,
      description,
      coverImage,
      archetype,
      archetypeDescription,
      order,
      "photoCount": count(*[_type == "photo" && category._ref == ^._id]),
      "previewPhotos": *[_type == "photo" && category._ref == ^._id] | order(title asc) [0...8] {
        _id, title, "slug": slug.current, image
      }
    }
  `);
}

/**
 * Fetch all photos in a given category (by slug).
 */
export async function getPhotosByCategory(categorySlug) {
  return client.fetch(`
    *[_type == "photo" && category->slug.current == $categorySlug] | order(title asc) {
      _id,
      title,
      "slug": slug.current,
      description,
      image,
      audio,
      video,
      featured,
      category->{name, "slug": slug.current}
    }
  `, { categorySlug });
}

/**
 * Fetch the featured "Picture of the Moment" photo.
 */
export async function getFeaturedPhoto() {
  return client.fetch(`
    *[_type == "photo" && featured == true][0] {
      _id,
      title,
      "slug": slug.current,
      description,
      image,
      category->{name, "slug": slug.current}
    }
  `);
}

// ── Cached Fetch Wrappers ───────────────────────────────────────
// These try Sanity first, update cache on success, fall back to
// cache on failure. Used by getStaticPaths() in page components.

/**
 * Fetch all photos + categories + featured photo with caching.
 * Returns { photos, categories, featured, source } where source
 * is 'sanity', 'cache', or 'local'.
 *
 * Uses a singleton promise so multiple page files calling this
 * during a single build share one Sanity request.
 */
let _fetchPromise = null;
export function fetchAllWithCache() {
  if (!_fetchPromise) {
    _fetchPromise = _doFetchAllWithCache();
  }
  return _fetchPromise;
}

async function _doFetchAllWithCache() {
  // 1) Try live Sanity with a hard 8-second race timeout
  //    (the Sanity client timeout can hang on blocked proxies)
  try {
    const sanityFetch = Promise.all([
      getAllPhotos(),
      getAllCategories(),
      getFeaturedPhoto()
    ]);
    const hardTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Hard timeout: Sanity unreachable after 8s')), 8000)
    );
    const [photos, categories, featured] = await Promise.race([sanityFetch, hardTimeout]);

    if (photos && photos.length > 0) {
      // Save to cache for next time
      writeCache({ photos, categories, featured });
      console.log(`[sanity] Live fetch: ${photos.length} photos, ${categories.length} categories`);
      return { photos, categories, featured, source: 'sanity' };
    }
  } catch (e) {
    console.warn(`[sanity] Live fetch failed: ${e.message}`);
  }

  // 2) Try build cache
  const cached = readCache();
  if (cached) {
    console.log(`[sanity] Using build cache: ${cached.photos.length} photos`);
    return {
      photos: cached.photos,
      categories: cached.categories,
      featured: cached.featured,
      source: 'cache'
    };
  }

  // 3) No cache available
  console.warn('[sanity] No cache available, falling back to local data');
  return { photos: null, categories: null, featured: null, source: 'local' };
}
