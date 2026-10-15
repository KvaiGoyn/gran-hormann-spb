export const colors = {
  anthracite: { name: 'Антрацит', value: '#3b4146' },
  white: { name: 'Белый', value: '#ecece6' },
  grey: { name: 'Серый алюминий', value: '#756f62' },
  wood: { name: 'Тёмный дуб', value: '#77513a' },
};

export const scenePalettes = {
  gate: { label: 'Ворота', initial: 'anthracite', colors },
  facade: {
    label: 'Фасад', initial: 'brick', colors: {
      white: { name: 'Тёплый белый', value: '#e7dfd2' },
      sand: { name: 'Песочный', value: '#c3a27a' },
      grey: { name: 'Серый', value: '#777b79' },
      brick: { name: 'Терракотовый', value: '#a55743' },
    },
  },
  roof: {
    label: 'Кровля', initial: 'slate', colors: {
      slate: { name: 'Сланец', value: '#58616b' },
      graphite: { name: 'Графит', value: '#383e45' },
      brown: { name: 'Коричневый', value: '#655144' },
      green: { name: 'Тёмно-зелёный', value: '#40534b' },
    },
  },
};

// Panels travel up, around the curved rail, then horizontally under the ceiling.
export function panelPose(startY, progress) {
  const distance = startY + Math.max(0, Math.min(1, progress)) * 3.7;
  const curveStart = 3;
  const radius = 0.45;
  const arc = Math.PI * radius / 2;
  if (distance <= curveStart) return { y: distance, z: 0, rotation: 0 };
  if (distance < curveStart + arc) {
    const angle = (distance - curveStart) / radius;
    return { y: curveStart + Math.sin(angle) * radius, z: -radius * (1 - Math.cos(angle)), rotation: -angle };
  }
  return { y: curveStart + radius, z: -radius - (distance - curveStart - arc), rotation: -Math.PI / 2 };
}
