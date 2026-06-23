# 🚀 Guia de Deploy: Vercel + Supabase

Este guia vai te ajudar a fazer o deploy da aplicação CMTU-LD Dashboard na Vercel usando Supabase como banco de dados PostgreSQL.

## Parte 1: Preparar o Código no GitHub

### 1.1. Fazer Push para GitHub

1. Abra o painel Git aqui no Replit (lado esquerdo → ícone de controle de versão)
2. Você verá todos os arquivos modificados
3. Clique em **Stage all** para preparar todos os arquivos
4. Digite uma mensagem de commit: "Preparar para deploy Vercel + Supabase"
5. Clique em **Commit & Push**
6. Se for a primeira vez, o Replit vai perguntar se deseja criar um repositório no GitHub - clique em **Criar**

## Parte 2: Configurar Supabase (Banco de Dados)

### 2.1. Criar Projeto no Supabase

1. Acesse https://supabase.com
2. Faça login ou crie uma conta (pode usar conta do GitHub)
3. Clique em **New Project**
4. Preencha:
   - **Name**: `cmtu-londrina`
   - **Database Password**: anote essa senha!
   - **Region**: escolha South America (São Paulo) para menor latência
5. Clique em **Create new project**
6. Aguarde 2-3 minutos enquanto o banco é criado

### 2.2. Obter Connection String

1. No painel do Supabase, clique em **Settings** (ícone de engrenagem)
2. Clique em **Database**
3. Role até a seção **Connection string**
4. Selecione **URI** (não Session)
5. Copie a string que começa com `postgresql://`
6. **IMPORTANTE**: Substitua `[YOUR-PASSWORD]` pela senha que você criou no passo 2.1
7. Para usar na Vercel, prefira a URL de pool/conexão compartilhada do Supabase
8. Salve essa connection string - você vai precisar dela!

### 2.3. Criar as Tabelas no Banco

Você tem duas opções:

**Opção A: Via Supabase SQL Editor (Recomendado)**

1. No Supabase, clique em **SQL Editor** no menu lateral
2. Clique em **+ New Query**
3. Cole este código SQL:

```sql
-- Criar tabela de áreas de serviço
CREATE TABLE service_areas (
  id SERIAL PRIMARY KEY,
  ordem INTEGER,
  tipo TEXT NOT NULL,
  endereco TEXT NOT NULL,
  bairro TEXT,
  metragem_m2 DOUBLE PRECISION,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  lote INTEGER,
  status TEXT NOT NULL DEFAULT 'Pendente',
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  polygon JSONB,
  scheduled_date TEXT,
  proxima_previsao TEXT,
  manual_schedule BOOLEAN DEFAULT false,
  days_to_complete INTEGER,
  servico TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela de equipes
CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  service TEXT NOT NULL,
  type TEXT NOT NULL,
  lote INTEGER,
  status TEXT NOT NULL DEFAULT 'Idle',
  current_area_id INTEGER,
  location JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela de configuração
CREATE TABLE app_config (
  id SERIAL PRIMARY KEY,
  mowing_production_rate JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Inserir configuração padrão
INSERT INTO app_config (mowing_production_rate) VALUES 
('{"lote1": 25000, "lote2": 20000}'::jsonb);
```

4. Clique em **Run** (ou Ctrl+Enter)
5. Deve aparecer "Success. No rows returned"

**Opção B: Via Terminal Local (se você tem Node.js instalado)**

```bash
export DATABASE_URL="sua-connection-string-aqui"
npm run db:push
npm run db:seed
```

## Parte 3: Deploy na Vercel

### 3.1. Criar Projeto na Vercel

1. Acesse https://vercel.com
2. Faça login (pode usar conta do GitHub)
3. Clique em **Add New** → **Project**
4. Autorize o Vercel a acessar seus repositórios do GitHub
5. Encontre o repositório `cmtu-londrina` (ou nome que você deu)
6. Clique em **Import**

### 3.2. Configurar Variáveis de Ambiente

1. Antes de clicar em Deploy, role até **Environment Variables**
2. Adicione as variáveis:
   - **Key**: `DATABASE_URL`
   - **Value**: cole sua connection string do Supabase
   - Marque os 3 ambientes: Production, Preview, Development
   - **Key**: `SESSION_SECRET`
   - **Value**: use uma senha longa e aleatória para proteger o login
   - Marque os 3 ambientes: Production, Preview, Development
3. Clique em **Add** para cada uma

### 3.3. Fazer Deploy

1. Clique em **Deploy**
2. Aguarde 2-3 minutos
3. Quando aparecer os fogos de artifício 🎉, seu app está online!
4. Clique em **Visit** para ver sua aplicação

## Parte 4: Testar a Aplicação

1. Abra a URL da Vercel
2. Verifique se o mapa carrega
3. Clique em **LIMPEZA URBANA** → **Roçagem Áreas Públicas**
4. Deve aparecer os marcadores no mapa

Se aparecer erro "Failed to fetch", volte ao Passo 3.2 e confirme que a `DATABASE_URL` e a `SESSION_SECRET` estão corretas.

## Parte 5: Popular com Dados (Opcional)

Se você executou apenas a Opção A no passo 2.3 (sem o seed), pode popular com dados de exemplo:

1. No SQL Editor do Supabase, execute este script:

```sql
-- Inserir áreas de exemplo (Lote 1)
INSERT INTO service_areas (ordem, tipo, endereco, bairro, metragem_m2, lat, lng, lote, servico, status, history) VALUES
(1, 'area publica', 'Av Jorge Casoni - Terminal Rodoviário', 'Casoni', 29184.98, -23.3044206, -51.1513729, 1, 'rocagem', 'Pendente', '[]'::jsonb),
(2, 'praça', 'Rua Carijós c/ Oraruana', 'Paraná', 2332.83, -23.3045262, -51.1480067, 1, 'rocagem', 'Pendente', '[]'::jsonb),
(3, 'area publica', 'Av Saul Elkind', 'Lago Parque', 15234.56, -23.2987, -51.1623, 1, 'rocagem', 'Pendente', '[]'::jsonb);

-- Inserir equipes de exemplo
INSERT INTO teams (service, type, lote, status, location) VALUES
('rocagem', 'Giro Zero', 1, 'Working', '{"lat": -23.3044, "lng": -51.1514}'::jsonb),
('rocagem', 'Giro Zero', 2, 'Working', '{"lat": -23.3367, "lng": -51.1534}'::jsonb);
```

## 🎯 Checklist Final

- [ ] Código no GitHub
- [ ] Projeto criado no Supabase
- [ ] Connection string copiada e senha substituída
- [ ] Tabelas criadas no banco
- [ ] Projeto criado na Vercel
- [ ] DATABASE_URL configurada
- [ ] Deploy realizado com sucesso
- [ ] Aplicação abrindo e mostrando o mapa
- [ ] Marcadores aparecem no mapa

## 🆘 Problemas Comuns

### Erro: "Failed to fetch"
- Verifique a DATABASE_URL na Vercel
- Confirme que substituiu [YOUR-PASSWORD] pela senha real
- Teste a connection string localmente primeiro

### Mapa vazio
- Execute o script de seed no SQL Editor
- Verifique se as tabelas foram criadas
- Olhe os logs na Vercel: Settings → Functions → Ver logs

### Build failed na Vercel
- Verifique se o código está no GitHub
- Confirme que o package.json está correto
- Veja os logs de build na Vercel

## 📞 Suporte

Se tiver dúvidas:
1. Verifique os logs na Vercel
2. Verifique os logs no Supabase
3. Teste a connection string localmente

## 💰 Custos

- **Supabase Free Tier**: 500MB de banco, 50.000 requisições/mês
- **Vercel Hobby**: Gratuito para projetos pessoais
- Total: **R$ 0,00/mês** para começar!
