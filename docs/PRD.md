# PRD — Controle Financeiro Pessoal

**Status:** Funcionalidades descritas implementadas no frontend  
**Plataforma:** Aplicação web responsiva  
**Persistência atual:** LocalStorage do navegador  
**Público-alvo:** Pessoas que desejam registrar receitas e despesas, organizar cartões, contas bancárias e reservas do Nubank.

## 1. Visão do Produto

O Controle Financeiro Pessoal permite registrar movimentações financeiras, acompanhar receitas, despesas, faturas e limites, além de organizar dinheiro distribuído entre contas bancárias e Caixinhas Nubank. O registro pode ser feito por texto curto em linguagem natural e revisado antes de ser salvo.

## 2. Objetivos

- Tornar rápido o registro de receitas e despesas.
- Permitir revisar os dados extraídos antes de gravá-los.
- Facilitar a gestão de compras parceladas em todas as telas relevantes.
- Separar os meios de pagamento das contas bancárias reais.
- Exibir saldos de conta, Caixinhas Nubank e total combinado.
- Atualizar as telas imediatamente após alterações, sem recarregar a página.

## 3. Escopo Implementado

### 3.1 Registro e extração de transações

**Requisitos funcionais**

- O usuário pode enviar frases completas ou curtas, por exemplo: `200 reais placa moto`.
- O sistema extrai valor, descrição, tipo, categoria, método de pagamento, quantidade de parcelas e data quando esses dados são identificáveis.
- O sistema categoriza transações usando regras e palavras-chave, incluindo exemplos como placa/moto em Transporte, farmácia em Saúde e mercado em Alimentação.
- Valores inválidos ou ausentes não são registrados.
- Antes de persistir, a aplicação apresenta uma confirmação para revisão dos dados extraídos.
- O usuário confirma ou descarta o lançamento; fechar o modal de confirmação equivale a descartar.
- Quando a confirmação é aceita, os dados são gravados localmente e as telas inscritas no estado financeiro são atualizadas.

**Critérios de aceite**

- `200 reais placa moto` gera uma despesa de R$ 200,00, com descrição `Placa moto` e categoria Transporte.
- É possível descartar uma sugestão sem gravar a transação.
- É possível confirmar e visualizar a nova transação no Extrato e nos indicadores correspondentes.
- A confirmação apresenta valor em destaque, descrição, categoria, conta/método, data e parcelas.

### 3.2 Identidade visual e navegação

- O nome da aplicação é **Controle Financeiro Pessoal**.
- A navegação principal inclui Chat, Dashboard, Extrato, Contas e Cartões.
- O modal de confirmação usa tema escuro, fundo desfocado, animação de entrada, destaque visual para valor de receita/despesa e ações de confirmar ou descartar.

### 3.3 Cartões e faturas

- O usuário pode cadastrar e editar cartões com nome, limite, fechamento e vencimento.
- A tela Cartões apresenta fatura por mês, compras associadas, total, limite usado e limite disponível.
- Compras parceladas usam o valor informado como valor unitário de cada parcela; o sistema não divide esse valor pela quantidade.
- O parser reconhece `X/Y` e `parcela X de Y`: X é a parcela atual e Y o total. O sistema grava a parcela X no mês atual e gera X+1 até Y nos meses seguintes.
- Parcelas de uma compra compartilham o mesmo `installment_group_id` e mantêm número, total de parcelas, valor integral e data mensal correspondente.

### 3.4 Exclusão de compras parceladas

- A exclusão de uma transação parcelada apresenta confirmação informando que todas as parcelas vinculadas serão removidas.
- Ao confirmar, todas as transações com o mesmo `installment_group_id` são excluídas.
- Uma transação sem grupo continua sendo excluída individualmente.
- As regras estão disponíveis nas telas Extrato e Cartões.

### 3.5 Edição em massa de parcelas

- Ao editar uma parcela, o modal oferece a opção **Aplicar a todas as parcelas deste grupo**.
- Com a opção marcada, valor, categoria e descrição são atualizados para todas as transações com o mesmo grupo.
- Sem a opção marcada, somente a transação selecionada é alterada.
- A atualização é propagada pelo armazenamento reativo para gráficos, faturas e limites.

### 3.6 Antecipação de parcelas

- Linhas parceladas oferecem ação para antecipar parcelas.
- O modal permite definir quantidade e valor unitário atualizado da parcela.
- A quantidade é limitada pelo conjunto restante indicado para a parcela selecionada.
- Ao confirmar, as últimas parcelas do grupo são movidas para a data atual e recebem o valor informado.
- A aplicação apresenta a mensagem `Parcelas antecipadas com sucesso!` e atualiza as listas e os totais.

### 3.7 Cadastro de contas bancárias

- A página **Contas** permite criar e editar contas com nome, instituição, tipo e saldo inicial.
- Tipos disponíveis: conta corrente, poupança e dinheiro/carteira.
- As transações podem ser associadas a uma conta bancária sem substituir o meio de pagamento ou a referência ao cartão.
- O Extrato exibe o nome da conta bancária quando um lançamento tem uma conta associada; lançamentos antigos continuam mostrando seu meio de pagamento original.
- O saldo da conta é calculado a partir do saldo inicial e das receitas/despesas vinculadas.
- A conta não pode ser excluída se tiver transações ou Caixinhas vinculadas.

### 3.8 Caixinhas Nubank

- Quando a instituição de uma conta contém `Nubank`, a conta apresenta as abas **Conta Nubank** e **Caixinhas**.
- O usuário pode cadastrar Caixinhas vinculadas àquela conta, informando nome e saldo atual.
- Cada Caixinha pode ser editada ou excluída individualmente.
- A aba exibe saldo da conta, saldo de cada Caixinha, soma dos saldos das Caixinhas e saldo total Nubank.
- O saldo total é calculado como saldo da conta mais a soma dos saldos cadastrados nas Caixinhas.
- Caixinhas são mantidas separadas dos lançamentos bancários para evitar contabilização duplicada.

**Critérios de aceite**

- Cadastrar uma conta cuja instituição seja Nubank revela as abas Conta Nubank e Caixinhas.
- Adicionar ou editar Caixinha atualiza imediatamente o respectivo saldo e o total.
- Excluir uma Caixinha atualiza imediatamente os totais.
- Uma conta Nubank com Caixinhas não pode ser excluída até que elas sejam removidas.

### 3.9 Gastos próprios e de terceiros

- Cada transação pode ter `expense_owner` com valor `Próprio` ou `Terceiros`.
- Registros antigos sem essa propriedade recebem `Próprio` na migração local.
- O parser identifica alguns contextos explícitos de terceiros, como `para o João` e `da Maria`; o usuário pode revisar a classificação no modal antes de confirmar.
- O seletor da confirmação permite escolher **Gasto Próprio** ou **Gasto de Terceiro** em despesas.
- O card **Despesas do Mês**, a meta de gastos e o gráfico de categorias do Dashboard consideram apenas gastos próprios.
- O Dashboard exibe **Total a Receber de Terceiros**, calculado a partir das despesas vinculadas aos contatos cadastrados.
- Extrato e faturas de Cartões exibem badge em transações de terceiros e oferecem filtros **Todos**, **Meus Gastos** e **Terceiros**.

**Critérios de aceite**

- `Comprei lanche 30 para o João` e `Uber 50 da Maria` são sugeridos como gastos de terceiros.
- Uma sugestão de terceiro pode ser alterada para própria antes de salvar, e vice-versa.
- Uma despesa de terceiros não aumenta despesas pessoais, meta de gastos ou categorias pessoais no Dashboard.
- A mesma despesa é contabilizada no total a receber do contato e no indicador geral do Dashboard.
- Os filtros nas tabelas mostram somente o grupo escolhido, mantendo `Todos` como padrão.

### 3.10 Cadastro nominal de terceiros e valores a receber

- A aplicação mantém um cadastro local de contatos com identificador e nome.
- Transações usam `contact_id` opcional como referência da pessoa. Sem ID, a despesa é pessoal; com ID, a despesa pertence ao contato e compõe o valor a receber.
- A página **Terceiros** permite adicionar, renomear, consultar e excluir contatos. A exclusão é bloqueada enquanto houver despesas vinculadas, para preservar o histórico.
- Cada pessoa mostra o total de despesas vinculadas e oferece a ação **Ver gastos**, que abre a lista filtrada daquele contato.
- O seletor **Gasto de quem?** está disponível na confirmação do chat e nos formulários manuais. **Meu Gasto** é o padrão; os contatos cadastrados são selecionáveis.
- A ação **Novo Terceiro** cria uma pessoa dentro do formulário atual, sem fechar o modal.
- O parser extrai nomes após contextos comuns como `para o João` e `da Maria`; quando a pessoa já existe, associa o ID automaticamente. Quando ainda não existe, oferece cadastro durante a confirmação.
- O formulário manual de nova transação no Extrato permite definir tipo, valor, descrição, categoria, pagamento, data e contato.
- Extrato e Cartões mostram badges nominais como `Para: João` e filtros que distinguem lançamentos pessoais dos vinculados a terceiros.
- O Dashboard mantém despesas com `contact_id` fora das despesas pessoais e da meta, e apresenta **Total a Receber de Terceiros** somando as despesas vinculadas.

**Critérios de aceite**

- Uma transação com `contact_id` soma ao total do respectivo contato; uma transação sem contato não soma.
- A ação **Ver gastos** apresenta somente as despesas daquela pessoa e o total correspondente.
- O parser associa nomes existentes e o modal permite criar um novo contato sem perder os dados já preenchidos.
- A classificação nominal é consistente nas tabelas, filtros, total a receber e orçamento pessoal.

## 4. Modelo de Dados Relevante

- **Transação:** tipo, valor, categoria, método de pagamento (`conta`), descrição, data, `contact_id` opcional, `expense_owner` legado/derivado, conta bancária opcional, cartão opcional e metadados de parcelamento.
- **Contato:** identificador e nome.
- **Cartão:** nome, limite, dia de fechamento e dia de vencimento.
- **Conta bancária:** nome, instituição, tipo e saldo inicial.
- **Caixinha:** conta bancária Nubank proprietária, nome e saldo atual informado pelo usuário.
- Os dados são separados em chaves locais para transações, cartões, contas e Caixinhas.

## 5. Requisitos Não Funcionais

- Interface em português do Brasil, responsiva e consistente com o tema escuro existente.
- Alterações no estado financeiro devem refletir sem refresh por meio do armazenamento reativo do frontend.
- Os dados devem sobreviver a recargas no mesmo navegador por meio do LocalStorage.
- Controles de edição e exclusão devem ter confirmação ou feedback visível quando aplicável.

## 6. Decisões e Limitações Conhecidas

- A extração de transações é baseada em expressões regulares e regras locais. Não há chamada a um modelo de IA ou serviço externo.
- A aplicação não consulta, autentica ou sincroniza com Nubank ou qualquer banco.
- Os saldos de Caixinhas são lançados manualmente; não há histórico de depósitos/resgates nem sincronização automática com transações.
- LocalStorage é específico do navegador e dispositivo. Os dados não são sincronizados entre dispositivos e não há backup na nuvem.
- O saldo das contas é derivado do saldo inicial mais transações vinculadas; transações sem uma conta bancária associada não alteram o saldo de uma conta específica.
- Os indicadores globais atuais consideram as transações. O saldo total das Caixinhas é apresentado na área da conta Nubank e não é incluído automaticamente nos indicadores gerais do Dashboard.
- A identificação automática de terceiros usa regras de texto e nomes próprios; não é uma classificação semântica completa, por isso a revisão manual no modal continua disponível.
- Os valores a receber são derivados das despesas vinculadas e ainda não possuem fluxo de baixa/pagamento ou liquidação parcial.

## 7. Fora do Escopo Atual

- Integração bancária/Open Finance e importação automática de extratos.
- Autenticação de usuário, sincronização remota, múltiplos perfis e recuperação de dados.
- Histórico de movimentações entre conta e Caixinhas.
- Conversação com IA generativa ou resposta livre a perguntas financeiras.
- Regras fiscais, recomendações de investimento ou aconselhamento financeiro.

## 8. Validação Técnica

- A compilação de produção foi validada com `npm run build` após as funcionalidades de contas e Caixinhas.
- O projeto apresenta avisos de bundle JavaScript acima de 500 kB, sem falha de compilação.
- A suíte Vitest teve falha de configuração observada anteriormente (`TypeError: Cannot read properties of undefined (reading 'config')`); portanto, os critérios acima não devem ser considerados integralmente validados por testes automatizados até a correção do setup de testes.