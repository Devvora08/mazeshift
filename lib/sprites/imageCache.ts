import { Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';

import { SPELL_ICONS } from '../modules/utilities/types';
import { HERO_SHEETS } from './heroFrames';
import { MONSTER_SHEETS } from './monsterFrames';

/**
 * Decoded sprite sheets shared across levels. Skia's useImage decodes per
 * mount, so each level load used to re-decode every sheet before the hero
 * could draw. Images here are decoded once and returned synchronously after.
 */
const decoded = new Map<number, SkImage>();
const pending = new Map<number, Promise<SkImage | null>>();

function loadImage(asset: number): Promise<SkImage | null> {
  const ready = decoded.get(asset);
  if (ready) return Promise.resolve(ready);
  let promise = pending.get(asset);
  if (!promise) {
    const uri = Image.resolveAssetSource(asset).uri;
    promise = Skia.Data.fromURI(uri)
      .then((data) => {
        const image = Skia.Image.MakeImageFromEncoded(data);
        if (image) decoded.set(asset, image);
        return image;
      })
      .catch((error) => {
        console.warn('Could not load sprite image', error);
        return null;
      })
      .finally(() => pending.delete(asset));
    pending.set(asset, promise);
  }
  return promise;
}

/** Drop-in for useImage with module-level caching; null source returns null. */
export function useCachedImage(asset: number | null | undefined): SkImage | null {
  const [image, setImage] = useState<SkImage | null>(() => (asset == null ? null : decoded.get(asset) ?? null));
  useEffect(() => {
    if (asset == null) { setImage(null); return; }
    const ready = decoded.get(asset);
    if (ready) { setImage(ready); return; }
    let live = true;
    void loadImage(asset).then((loaded) => { if (live) setImage(loaded); });
    return () => { live = false; };
  }, [asset]);
  return image;
}

/** Warm the cache at app start so the first level also shows the hero at once. */
export function preloadSpriteImages() {
  const assets = new Set<number>();
  for (const sheet of Object.values(HERO_SHEETS)) assets.add(sheet.asset);
  for (const icon of Object.values(SPELL_ICONS)) assets.add(icon);
  for (const sheets of Object.values(MONSTER_SHEETS)) {
    for (const sheet of Object.values(sheets)) assets.add(sheet.asset);
  }
  // Hero first: it gates level start visibly; monsters and icons follow.
  for (const asset of assets) void loadImage(asset);
}
