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

// Filtra e ordena por relevância: correspondência no campo principal (nome)
// vem antes de correspondência apenas nos campos secundários (complemento, região).
// Sem isso, "joão cândido" enterrava a própria "Rua Prof. João Cândido" embaixo
// de dezenas de locais que só citam a rua no complemento.
export function rankearBusca<T>(
  itens: T[],
  consulta: string,
  principal: (item: T) => string,
  secundario: (item: T) => string,
  limite?: number
): T[] {
  const q = consulta.trim();
  if (!q) return limite ? itens.slice(0, limite) : itens;
  const qNorm = normalizarTextoBusca(q);

  const pontuados: { item: T; score: number }[] = [];
  for (const item of itens) {
    const nome = normalizarTextoBusca(principal(item));
    const completo = `${nome} ${normalizarTextoBusca(secundario(item))}`;
    let score: number | null = null;
    if (nome.startsWith(qNorm)) score = 0; // nome começa com o que foi digitado
    else if (correspondeBusca(principal(item), q)) score = 1; // termos no nome
    else if (correspondeBusca(completo, q)) score = 2; // termos no conjunto (complemento/região)
    if (score !== null) pontuados.push({ item, score });
  }
  pontuados.sort((a, b) => a.score - b.score);
  const resultado = pontuados.map((p) => p.item);
  return limite ? resultado.slice(0, limite) : resultado;
}
