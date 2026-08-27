export interface SkillManifest {
  name: string;
  description: string;
  appliesTo: (imageCount: number) => boolean;
}

export const h3SkillManifest: SkillManifest[] = [
  { name: 't2va', description: 'Text-to-video/audio prompt for pure text input.', appliesTo: (n) => n === 0 },
  { name: 'i2va', description: 'Image-to-video/audio prompt anchored on one first-frame reference.', appliesTo: (n) => n === 1 },
  { name: 'fl2va', description: 'First/last-frame interpolation prompt for two references.', appliesTo: (n) => n === 2 },
  { name: 'ref2va', description: 'Full-reference six-section prompt for multi-reference assets.', appliesTo: (n) => n >= 3 }
];

export function discoverH3Skill(imageCount: number): SkillManifest {
  return h3SkillManifest.find((skill) => skill.appliesTo(imageCount)) ?? h3SkillManifest[0];
}
