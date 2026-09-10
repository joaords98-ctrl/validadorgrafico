// Catálogo padrão de materiais da campanha (nome, tamanho final em mm, material, forma)
export const PRODUTOS = [
  // Papelaria
  { nome: 'Panfleto 14×20', cat: 'Papelaria', peca: 'Panfleto', w: 140, h: 200, material: 'Couchê 90g', forma: 'ret' },
  { nome: 'Santão 10×14', cat: 'Papelaria', peca: 'Santão', w: 100, h: 140, material: 'Couchê 90g', forma: 'ret' },
  { nome: 'Colinha 7×10', cat: 'Papelaria', peca: 'Colinha', w: 70, h: 100, material: 'Couchê 90g', forma: 'ret' },
  { nome: 'Folder duas dobras 21×29,7 (10×21 por página)', cat: 'Papelaria', peca: 'Folder', w: 210, h: 297, material: 'Couchê 120g', forma: 'ret', obs: 'Aberto 21×29,7 cm, 3 painéis de 10×21 (o do meio 9,7)' },
  // Adesivos
  { nome: 'Perfurado 70×33', cat: 'Adesivos', peca: 'Adesivo perfurado', w: 700, h: 330, material: 'Vinil perfurado', forma: 'ret' },
  { nome: 'Parachoque 26×8', cat: 'Adesivos', peca: 'Adesivo parachoque', w: 260, h: 80, material: 'Vinil comum', forma: 'ret' },
  { nome: 'Pragão 7×7 redondo', cat: 'Adesivos', peca: 'Adesivo redondo', w: 70, h: 70, material: 'Vinil comum', forma: 'redondo' },
  { nome: 'Paraguinha 5×5 redondo', cat: 'Adesivos', peca: 'Adesivo redondo', w: 50, h: 50, material: 'Vinil comum', forma: 'redondo' },
  // Tecido
  { nome: 'Bandeira 140×90', cat: 'Tecido', peca: 'Bandeira', w: 1400, h: 900, material: 'Flag', forma: 'ret', bleed: 0 },
  { nome: 'Windbanner 140×70 (molde curvo esquerdo)', cat: 'Tecido', peca: 'Windbanner', w: 700, h: 1470, material: 'Flag', forma: 'molde', molde: 'wind-curvo-esquerdo', bleed: 0 },
]

// Moldes de corte especial, em mm, origem no canto inferior esquerdo (como no PDF)
export const MOLDES = {
  'wind-curvo-esquerdo': {
    nome: 'Windbanner curvo esquerdo 140×70', arquivo: '/moldes/wind-curvo-esquerdo.pdf', w: 700, h: 1470,
    // contorno de corte/costura (cinza escuro no molde)
    corte: 'M 0 0 L 700 0 L 700 986.4 C 700 1178.9 503.9 1470 198.9 1470 L 0 1470 Z',
    // área visível/segura (cinza claro no molde) — arte importante fica dentro
    seguro: 'M 0 0 L 0 1420 L 198.9 1420 C 327.5 1420 441.6 1361.5 526.7 1266.9 C 564.6 1224.8 596.4 1175.7 618.6 1123.5 C 636.7 1081.2 650 1032.6 650 986.4 L 650 0 Z',
    dica: 'A página da arte tem que ser exatamente 70 × 147 cm (formato do molde). A curva e a faixa de 5 cm da direita/topo são costura e bainha: não coloque texto nem logo ali.',
  },
}
export const PECAS = [...new Set(PRODUTOS.map(p => p.peca)), 'Cartaz', 'Banner', 'Outro']
