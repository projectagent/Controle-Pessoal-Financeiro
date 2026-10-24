# Controle Financeiro Pessoal

Aplicativo desktop/local de gestão financeira pessoal com arquitetura cliente-servidor e banco de dados SQLite físico. Focado no controle rigoroso de fluxo de caixa, isolamento estrito de gastos realizados para terceiros (evitando distorções no saldo pessoal), acompanhamento de consórcios/financiamentos de longo prazo e renovação automática de despesas recorrentes e assinaturas.

> 🤖 **Metodologia de Desenvolvimento — 100% Vibe Code com Prompts Estruturados**  
> Este projeto foi concebido, arquitetado e implementado integralmente através de **Vibe Coding utilizando Prompts Estruturados**. Todas as regras de negócio financeiras, modelagem SQL, rotas de API, componentes de interface e testes automatizados foram construídos por meio de especificações técnicas detalhadas, engenharia de contexto e iterações orientadas por IA.

---

## 🛠️ Tecnologias Utilizadas

### Frontend
- **React 19** (`^19.2.0`) com **TypeScript 5.8**
- **Vite 8** (Build tool e bundler de alta performance)
- **TanStack Start & TanStack Router** (Roteamento file-based com tipagem estrita)
- **TanStack React Query v5** (Gerenciamento de estado assíncrono e cache de dados)
- **Tailwind CSS v4** (`@tailwindcss/vite` e `tw-animate-css`) para estilização utilitária moderna
- **Radix UI & shadcn/ui** (`class-variance-authority`, `clsx`, `tailwind-merge`, `vaul`, `cmdk`) para componentes acessíveis e interativos
- **React Hook Form + Zod** (`@hookform/resolvers`) para validação e controle de formulários com esquemas tipados
- **Recharts** (Gráficos visuais de despesas por categoria e evolução histórica)
- **date-fns v4 & React Day Picker** (Manipulação de datas e seletores de calendário)
- **Lucide React** (Ícones da interface) e **Sonner** (Notificações toast)

### Backend & Armazenamento
- **Node.js** (ES Modules) com **Express 5** (`^5.3.0`) servindo a API REST na porta `3001`
- **SQLite 3** (`^6.0.1` — arquivo `database.sqlite` na raiz do projeto) com integridade referencial ativa (`PRAGMA foreign_keys = ON`)
- **CORS** para integração segura entre frontend e backend
- **Concurrently** para orquestração e inicialização paralela dos servidores (`SERVER` e `CLIENT`)

### Qualidade de Código, Testes & Metodologia
- **Vibe Coding & Engenharia de Prompts Estruturados** (Desenvolvimento 100% guiado por IA com prompts arquiteturais e funcionais estruturados)
- **Vitest 4** + **Testing Library** (`@testing-library/react`, `@testing-library/jest-dom`, `jsdom`) para testes unitários e de integração
- **ESLint 9** + **Prettier** para padronização e formatação estática de código

---

## 🚀 Funcionalidades Principais

- **Dashboard Financeiro Inteligente**:
  - **Saldo Atual Real**: Calculado via SQL como `(Soma de todas as Receitas) − (Soma de todas as Despesas realizadas)`, garantindo que desembolsos feitos para terceiros abatam o saldo disponível sem contaminar os gastos pessoais.
  - **Meta de Gastos do Mês**: Barra de progresso com alerta visual configurável, contabilizando exclusivamente despesas pessoais.
  - **Transações Recentes Filtradas**: Isolamento temporal que exibe apenas as movimentações do mês corrente, impedindo que parcelas futuras de consórcios poluam a visão do período.
  - **Distribuição por Categoria**: Gráficos e indicadores agregados diretamente pelo banco de dados.

- **Extrato Mensal em Linha do Tempo**:
  - Navegador mensal centralizado (`< Mês/Ano >`) com histórico agrupado por dia.
  - Painel de 4 totalizadores no topo: *Total Gastos Mês (pessoais)*, *A Receber (terceiros pendentes)*, *Total Gasto Geral (pessoais + repasses)* e *Entradas*.
  - Identificação visual para transações de terceiros (badge com nome do contato e valor em destaque alaranjado).
  - Ação rápida de "Dar Baixa" (marcar como pago/pendente).

- **Gestão de Terceiros e Repasses**:
  - Controle de cobranças para valores pagos a favor de amigos e familiares.
  - Destaque claro do valor *"A repassar neste mês"* para cobranças imediatas versus o total histórico geral.
  - Histórico detalhado por contato e baixa individual de despesas.

- **Consórcios e Financiamentos**:
  - Lançamento inteligente com controle de parcelas (ex: `12/69`).
  - Cálculo de patrimônio, valor pago, saldo devedor e percentual de amortização.
  - Antecipação de parcelas e cancelamento em lote por grupo de parcelas.

- **Assinaturas e Gastos Fixos**:
  - Categoria "Assinatura / Fixo" com renovação automática mensal.
  - Rotina de virada de mês que detecta e replica automaticamente as assinaturas ativas sem duplicidade.

- **Zona de Perigo (Zerar Banco de Dados)**:
  - Painel dedicado em Configurações para reset completo do aplicativo.
  - Dupla confirmação com exigência de digitação do texto `"CONFIRMAR"` para proteção contra exclusões acidentais.
  - Execução de `DELETE FROM` em todas as tabelas operacionais e `VACUUM` no SQLite, restaurando o estado zerado.

---

## 💻 Como Executar Localmente

### Pré-requisitos
- **Node.js** (versão 18 ou superior)
- **npm** (incluso com o Node.js)

### 1. Instalação das Dependências

Todas as dependências do projeto (Express, SQLite3, CORS, Concurrently, React, etc.) já estão registradas no `package.json`.

Abra o terminal (**PowerShell** ou **CMD**) na pasta do projeto e execute:

```powershell
npm install
```

> **Nota para PowerShell no Windows:** Caso o PowerShell exiba erro de política de execução (`PSSecurityException` referente ao `npm.ps1`), você pode rodar diretamente:
> ```powershell
> npm.cmd install
> ```
> Ou liberar a permissão na sessão atual com:
> ```powershell
> Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
> ```

### 2. Inicialização do Projeto

Você pode iniciar o sistema de duas maneiras:

#### Opção A: Executável Rápido (Windows)
Dê um duplo clique no arquivo:
```bash
iniciar.bat
```
O script iniciará o servidor backend e o frontend juntos e abrirá automaticamente a aplicação no navegador em `http://localhost:5173`.

#### Opção B: Via Terminal (Linha de Comando)
Execute:
```bash
npm run dev
```
O comando iniciará simultaneamente:
- **Backend API**: `http://localhost:3001`
- **Frontend App**: `http://localhost:5173`

---

## 💾 Backup e Restauração dos Dados

Toda a persistência da aplicação é centralizada em um banco de dados físico local, tornando o backup e a migração entre computadores extremamente simples:

- **Arquivo que deve ser salvo (Backup)**:
  `database.sqlite` *(localizado na pasta raiz do projeto)*.

### Como fazer o Backup:
1. Certifique-se de que a aplicação não está em uso no momento.
2. Copie o arquivo `database.sqlite` para um local seguro (pendrive, nuvem, pasta de backup, etc.).

### Como Restaurar:
1. Cole o arquivo `database.sqlite` salvo de volta na pasta raiz do projeto (substituindo o arquivo atual, se houver).
2. Inicie a aplicação via `iniciar.bat` ou `npm run dev`. Todas as suas transações, contas bancárias, cartões e contatos estarão imediatamente restaurados.

---

## 🧪 Testes Automatizados

O projeto conta com suíte de testes unitários e de integração utilizando **Vitest**:

```bash
npm test
```
