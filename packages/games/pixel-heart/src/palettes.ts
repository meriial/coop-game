export interface Palette {
  id: string;
  name: string;
  colors: string[];
}

// Each palette spans the hue wheel with enough value contrast so players remain visually distinct.
// White and black are included in every palette so players can add light/dark accents.
export const PALETTES: Palette[] = [
  {
    id: 'earth',
    name: 'Earth',
    colors: ['#8B4513', '#D2691E', '#F4A460', '#228B22', '#6B8E23', '#8FBC8F', '#2F4F4F', '#708090', '#FFFFFF', '#000000'],
  },
  {
    id: 'pastel',
    name: 'Pastel',
    colors: ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E2BAFF', '#FFB3F7', '#B3FFFB', '#FFFFFF', '#000000'],
  },
  {
    id: 'vibrant',
    name: 'Vibrant',
    colors: ['#E63946', '#F4A261', '#E9C46A', '#2A9D8F', '#06D6A0', '#118AB2', '#8338EC', '#FF006E', '#FFFFFF', '#000000'],
  },
];
