# CMTU-LD Operations Dashboard

Dashboard operacional para gestão de serviços urbanos em Londrina, Brasil.

## 🚀 Deploy na Vercel com Supabase

### 1. Criar Banco de Dados no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta
2. Crie um novo projeto
3. Aguarde a criação do banco de dados
4. Vá em **Settings** → **Database**
5. Copie a **Connection String** PostgreSQL do Supabase
6. Para hospedagem na Vercel, prefira a URL de pool/conexão compartilhada do Supabase

### 2. Configurar Migrations e Seed

No seu ambiente local, configure a variável de ambiente:

```bash
cp .env.example .env
```

Depois edite o arquivo `.env` e preencha `DATABASE_URL` e `SESSION_SECRET`.

Execute a sincronização do schema para criar as tabelas:

```bash
npm run db:push
```

Se quiser, depois popule o banco com dados iniciais usando os scripts da pasta `db/`.

```bash
npm run db:seed
```

### 3. Deploy na Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login
2. Clique em **Add New** → **Project**
3. Importe seu repositório do GitHub
4. Configure as variáveis de ambiente:
   - `DATABASE_URL`: sua connection string do Supabase
   - `SESSION_SECRET`: uma senha longa e aleatória para proteger o login
5. Clique em **Deploy**

### 4. Configurar Domínio (Opcional)

1. No painel da Vercel, vá em **Settings** → **Domains**
2. Adicione seu domínio customizado

## 📦 Scripts Disponíveis

```bash
# Desenvolvimento local
npm run dev

# Verificar TypeScript
npm run check

# Sincronizar schema com o banco
npm run db:push

# Build para produção
npm run build

# Iniciar em produção
npm start
```

## 🗄️ Estrutura do Banco de Dados

### Tabelas

- **service_areas**: Áreas de serviço (roçagem, jardins)
- **teams**: Equipes de campo
- **app_config**: Configurações do sistema

### Campos Importantes

#### service_areas
- `manualSchedule`: Flag para proteger agendamentos manuais
- `scheduledDate`: Data de início do serviço
- `proximaPrevisao`: Próxima data prevista
- `history`: Histórico de manutenções (JSONB)
- `polygon`: Polígono da área (JSONB)

## 🎨 Funcionalidades

- ✅ Mapa interativo com Leaflet.js
- ✅ Seleção múltipla de áreas
- ✅ Agendamento em lote manual
- ✅ Agendamento automático inteligente
- ✅ Histórico de manutenções
- ✅ Visualização de equipes em tempo real
- ✅ Dark mode e paleta de cores customizada

## 🔐 Variáveis de Ambiente

### Desenvolvimento
```env
DATABASE_URL=postgresql://...
SESSION_SECRET=uma-chave-local
PORT=5000
NODE_ENV=development
```

### Produção (Vercel)
Configure no painel da Vercel:
- `DATABASE_URL`: Connection string do Supabase
- `SESSION_SECRET`: chave longa e aleatória para sessão/login

## 💡 Dicas

### Trocar entre MemStorage e DbStorage

A aplicação detecta automaticamente:
- Em desenvolvimento: se `DATABASE_URL` estiver ausente, usa memória
- Em produção: `DATABASE_URL` é obrigatória

### Supabase como banco oficial

O projeto agora usa driver PostgreSQL genérico, que funciona melhor com Supabase do que a configuração anterior herdada do Neon/Replit.

### Uploads

O upload de fotos ainda usa integração de storage herdada do Replit. A aplicação pode ser publicada antes disso, mas essa parte deve ser migrada depois para uma solução compatível com Vercel, como Supabase Storage.

### Backup do Banco

```bash
# Export via Supabase Dashboard
# Settings → Database → Database Settings → Connection Pooling
```

### Monitoramento

- Logs da aplicação: Painel da Vercel
- Logs do banco: Painel do Supabase

## 🆘 Troubleshooting

### Erro de conexão com banco
- Verifique se a DATABASE_URL está correta
- Confirme que o IP da Vercel está autorizado no Supabase
- Supabase permite todas as conexões por padrão

### Migrations não aplicam
```bash
# Force push schema
npm run db:push
```

### Dados não aparecem
```bash
# Execute seed novamente
npm run db:seed
```

## 📞 Suporte

Para issues ou dúvidas, abra uma issue no repositório.

## 📄 Licença

MIT
