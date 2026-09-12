export type PromptBindingImage = {
  id: string;
  displayName: string;
  uri: string;
  filename?: string;
  ordinal?: number;
  identityKnown?: boolean;
};

export function imageReferenceOrdinal(label: string): number | undefined {
  const match = /^(?:@?图片\s*|@?Picture\s+|<Picture\s+|<图片\s*)(\d+)>?$/i.exec(label.trim());
  const ordinal = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(ordinal) && ordinal > 0 ? ordinal : undefined;
}

export function parsePromptImageReferences(prompt: string): Array<{ ordinal: number; label: string }> {
  const ordinals = new Set<number>();
  for (const match of prompt.matchAll(/@(?:图片\s*|Picture\s+)(\d+)\b|<(?:图片\s*|Picture\s+)(\d+)>/gi)) {
    const ordinal = Number(match[1] ?? match[2]);
    if (Number.isSafeInteger(ordinal) && ordinal > 0) ordinals.add(ordinal);
  }
  return [...ordinals].map(ordinal => ({ ordinal, label: `图片${ordinal}` }));
}

export function validatePromptBindings(prompt: string, sourceImages: readonly PromptBindingImage[], requireContiguous = true) {
  const references = parsePromptImageReferences(prompt);
  const images = sourceImages.map(image => ({ ...image, ...(image.ordinal ?? imageReferenceOrdinal(image.displayName) ? { ordinal: image.ordinal ?? imageReferenceOrdinal(image.displayName) } : {}) }));
  const ids = new Set<string>();
  const ordinals = new Set<number>();
  let invalid = false;
  for (const image of images) {
    const alias = imageReferenceOrdinal(image.displayName);
    if (!image.id || ids.has(image.id) || (image.identityKnown === false && references.length > 0)) invalid = true;
    ids.add(image.id);
    if (image.ordinal !== undefined) {
      if (!Number.isSafeInteger(image.ordinal) || image.ordinal < 1 || ordinals.has(image.ordinal) || (alias !== undefined && alias !== image.ordinal)) invalid = true;
      ordinals.add(image.ordinal);
    } else if (references.length > 0) invalid = true;
  }
  images.sort((left, right) => (left.ordinal ?? Infinity) - (right.ordinal ?? Infinity));
  if (requireContiguous && ordinals.size && images.some((image, index) => image.ordinal !== index + 1)) invalid = true;
  const missing = references.filter(reference => !images.some(image => image.identityKnown !== false && image.ordinal === reference.ordinal)).map(reference => reference.ordinal);
  return { ok: !invalid && missing.length === 0, images, missing, invalid };
}

/** Translate conversation labels to the creation page's selected image positions. */
export function preparePromptExport(prompt: string, sourceImages: readonly PromptBindingImage[]) {
  const bindings = validatePromptBindings(prompt, sourceImages, false);
  const positions = new Map(bindings.images.map((image, index) => [image.ordinal, index + 1]));
  if (!bindings.ok) return { ...bindings, prompt };
  const rewritten = prompt.replace(/@(?:图片\s*|Picture\s+)(\d+)\b|<(?:图片\s*|Picture\s+)(\d+)>/gi,
    (label, chinese: string | undefined, bracketed: string | undefined) => label.replace(/\d+/, String(positions.get(Number(chinese ?? bracketed)))));
  // With no numeric references, unnumbered legacy images are safe to assign
  // export positions too. Referenced, unidentified images were rejected above.
  return { ...bindings, prompt: rewritten, images: bindings.images.map((image, index) => ({
    ...image, ordinal: index + 1,
    displayName: imageReferenceOrdinal(image.displayName) === undefined ? image.displayName : image.displayName.replace(/\d+/, String(index + 1)),
  })) };
}
