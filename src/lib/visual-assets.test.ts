import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getPublicAssetPath } from './public-asset-path';
import { MATERIAL_ASSETS, getRoleAccent, getSurfaceDecorations } from './visual-assets';

const stylesPath = fileURLToPath(new URL('../styles.css', import.meta.url));

const publicAssetsDirectory = fileURLToPath(new URL('../../public/assets/', import.meta.url));

describe('visual asset planning', () => {
  it('keeps the home surface centered on local strawberry dessert materials', () => {
    const assets = getSurfaceDecorations('home', 'desktop');

    expect(assets[0].kind).toBe('paper');
    expect(assets[1].src).toBe(getPublicAssetPath('assets/stickers/strawberry.svg'));
  });

  it('registers local floral stickers with the existing dessert illustration license', () => {
    expect(MATERIAL_ASSETS.roseBouquet.src).toBe(getPublicAssetPath('assets/stickers/rose-bouquet.svg'));
    expect(MATERIAL_ASSETS.rose.src).toBe(getPublicAssetPath('assets/stickers/rose.svg'));
    expect(MATERIAL_ASSETS.roseBouquet.attribution.license).toBe('CC-BY-4.0');
    expect(MATERIAL_ASSETS.rose.attribution.license).toBe('CC-BY-4.0');
  });

  it('adds floral clusters on desktop without increasing the mobile decoration budget', () => {
    expect(getSurfaceDecorations('home', 'desktop').map((asset) => asset.src)).toEqual([
      getPublicAssetPath('assets/materials/cotton-jersey-diffuse-cc0.jpg'),
      getPublicAssetPath('assets/stickers/strawberry.svg'),
      getPublicAssetPath('assets/stickers/ribbon.svg'),
      getPublicAssetPath('assets/stickers/rose-bouquet.svg'),
      getPublicAssetPath('assets/stickers/rose.svg')
    ]);
    expect(getSurfaceDecorations('home', 'mobile')).toHaveLength(2);
    expect(getSurfaceDecorations('timeline', 'mobile')).toHaveLength(2);
    expect(getSurfaceDecorations('photos', 'mobile')).toHaveLength(2);
  });

  it('keeps mobile decorations limited to two assets per surface', () => {
    for (const surface of ['home', 'timeline', 'photos', 'plans', 'settings'] as const) {
      expect(getSurfaceDecorations(surface, 'mobile')).toHaveLength(2);
    }
  });

  it('keeps L blue and W pink as the role semantics', () => {
    expect(getRoleAccent('l')).toEqual({
      main: '#5E9EBD',
      detail: '#365F76'
    });
    expect(getRoleAccent('w')).toEqual({
      main: '#D88EA5',
      detail: '#923D5A'
    });
  });

  it('keeps every decorative asset local and records a reusable license source', () => {
    for (const asset of Object.values(MATERIAL_ASSETS)) {
      expect(asset.src).toMatch(new RegExp(`^${getPublicAssetPath('assets/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      expect(asset.attribution.sourceUrl).toMatch(/^https:\/\//);
      expect(['CC0-1.0', 'CC-BY-4.0']).toContain(asset.attribution.license);
    }
  });

  it('ships only the decorative assets documented in the manifest and attribution record', async () => {
    const directories = ['materials', 'stickers'] as const;
    const publishedSources = (await Promise.all(
      directories.map(async (directory) => {
        const files = await readdir(`${publicAssetsDirectory}${directory}`);
        return files.map((file) => getPublicAssetPath(`assets/${directory}/${file}`));
      })
    )).flat().sort();
    const documentedSources = Object.values(MATERIAL_ASSETS).map((asset) => asset.src).sort();
    const attribution = await readFile(`${publicAssetsDirectory}ATTRIBUTIONS.md`, 'utf8');

    expect(publishedSources).toEqual(documentedSources);
    for (const source of publishedSources) {
      expect(attribution).toContain(`\`${source.replace(getPublicAssetPath('assets/'), '')}\``);
    }
  });

  it('does not hard-code a root-relative material background that breaks project-site hosting', async () => {
    const styles = await readFile(stylesPath, 'utf8');

    expect(styles).not.toContain("url('/assets/materials/cotton-jersey-diffuse-cc0.jpg')");
    expect(styles).toContain('var(--cotton-lining-image)');
  });

});
