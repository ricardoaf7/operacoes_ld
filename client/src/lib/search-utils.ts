// Busca tolerante: ignora acentos, pontuação e ordem exata.
// Cada palavra digitada precisa aparecer em algum lugar do texto.
// Ex.: "av jk" encontra "Av. JK até Av. Leste Oeste"; "joao candido" encontra "Rua Prof. João Cândido".

export function normalizarTextoBusca(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[.,;:()\-–—/\\]/g, " ") // pontuação vira espaço
    .replace(/\s+/g, " ")
    .trim();
}

export function correspondeBusca(texto: string, consulta: string): boolean {
  const alvo = normalizarTextoBusca(texto);
  const termos = normalizarTextoBusca(consulta).split(" ").filter(Boolean);
  if (termos.length === 0) return true;
  return termos.every((t) => alvo.includes(t));
}
