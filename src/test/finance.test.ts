import { describe, expect, it } from "vitest";
import { resumoMensalSeparado, agruparPorDia, deslocarMes, resumoMensal, transacoesDoMes, calcularSaldoAtual, addTransaction, anteciparParcelas, cancelarRenovacaoAssinatura, CATEGORIAS, deleteCard, extractFinancialTransactions, gerarParcelas, gerarParcelasUnitarias, limiteUsado, loadCards, loadFinanceSettings, loadTransactionAccounts, parseMessage, processarRecorrencias, reativarRenovacaoAssinatura, resumirPlanoLongoPrazo, toggleTransactionPaid, totalAReceber, totalAReceberGeral, totalAReceberMes, updateMonthlySpendingLimit, updateTransactionsByInstallmentGroupId, upsertCard, upsertTransactionAccount, type Cartao } from "@/lib/finance";

describe("parcelamento", () => {
  it("detecta 'em 10 vezes' e força crédito", () => {
    const d = parseMessage("Comprei uma TV de 1200 em 10 vezes")!;
    expect(d.parcelas).toBe(10);
    expect(d.valor).toBe(1200);
    expect(d.conta).toBe("Crédito");
  });

  it("detecta 'parcelado em 3'", () => {
    expect(parseMessage("Gastei 300 no sofá parcelado em 3")!.parcelas).toBe(3);
  });

  it("classifica transferências recebidas como receita", () => {
    const d = parseMessage("Recebi R$ 1200 por transferência")!;
    expect(d.tipo).toBe("receita");
    expect(d.categoria).toBe("Outros");
  });

  it("categorizza gastos em farmácia como saúde", () => {
    const d = parseMessage("Paguei R$ 89,90 na farmácia")!;
    expect(d.tipo).toBe("despesa");
    expect(d.categoria).toBe("Saúde");
  });

  it("gera X linhas futuras preservando o valor unitário informado", () => {
    const rows = gerarParcelas({ tipo: "despesa", valor: 100, categoria: "Compras", conta: "Crédito", descricao: "x", data: "2026-01-31" }, 3);
    expect(rows.map((r) => r.data)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(rows.map((r) => `${r.parcela}/${r.totalParcelas}`)).toEqual(["1/3", "2/3", "3/3"]);
    expect(rows.map((row) => row.valor)).toEqual([100, 100, 100]);
  });

  it("gera parcelas unitárias a partir do índice atual sem dividir o valor", () => {
    const rows = gerarParcelasUnitarias({ tipo: "despesa", valor: 552.23, asset_value: 30000, categoria: "Consórcio", conta: "Débito", descricao: "Consórcio", data: "2026-10-23" }, 12, 69);

    expect(rows).toHaveLength(58);
    expect(rows[0]).toMatchObject({ parcela: 12, parcelaInicial: 12, totalParcelas: 69, valor: 552.23, asset_value: 30000 });
    expect(rows.at(-1)).toMatchObject({ parcela: 69, valor: 552.23, asset_value: 30000 });
  });

  it("salva todas as parcelas futuras do consórcio com o valor unitário integral", () => {
    addTransaction({ tipo: "despesa", valor: 552.23, categoria: "Consórcio", conta: "Débito", descricao: "Consórcio 12/69", data: "2026-10-23" }, 69, { parcelaInicial: 12, valorUnitario: true });

    const rows = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]")
      .filter((transaction: { descricao: string }) => transaction.descricao === "Consórcio 12/69");
    expect(rows).toHaveLength(58);
    expect(rows.every((transaction: { valor: number }) => transaction.valor === 552.23)).toBe(true);
    expect(rows[0]).toMatchObject({ parcela: 12, parcelaInicial: 12, totalParcelas: 69 });
    expect(rows.at(-1)).toMatchObject({ parcela: 69, totalParcelas: 69 });
  });

  it("trata qualquer categoria parcelada como valor unitário ao salvar", () => {
    addTransaction({ tipo: "despesa", valor: 50, categoria: "Compras", conta: "Crédito", descricao: "Fone", data: "2026-10-23" }, 4);

    const rows = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]")
      .filter((transaction: { descricao: string }) => transaction.descricao === "Fone");
    expect(rows).toHaveLength(4);
    expect(rows.map((transaction: { valor: number }) => transaction.valor)).toEqual([50, 50, 50, 50]);
    expect(new Set(rows.map((transaction: { installment_group_id: string }) => transaction.installment_group_id)).size).toBe(1);
  });

  it("estima progresso com parcelas passadas e valor unitário do contrato", () => {
    const rows = [
      { id: "12", tipo: "despesa" as const, valor: 552.23, categoria: "Consórcio", conta: "Débito", descricao: "Consórcio", data: "2026-10-23", parcela: 12, parcelaInicial: 12, totalParcelas: 69 },
      { id: "13", tipo: "despesa" as const, valor: 552.23, categoria: "Consórcio", conta: "Débito", descricao: "Consórcio", data: "2026-11-23", parcela: 13, parcelaInicial: 12, totalParcelas: 69 },
    ];

    expect(resumirPlanoLongoPrazo(rows, new Date(2026, 9, 23))).toMatchObject({
      parcelaAtual: 12,
      totalParcelas: 69,
      valorParcela: 552.23,
      percentualConcluido: 17,
      totalPago: 6626.76,
      saldoDevedor: 31477.11,
    });
  });
});

describe("extração estrita de lançamentos", () => {
  it("aceita uma frase curta com valor e descrição sem verbo", () => {
    const result = extractFinancialTransactions("200 reais placa moto");

    expect(result.transactions[0]).toMatchObject({
      type: "EXPENSE",
      amount: 200,
      description: "Placa moto",
      category: "Transporte",
    });
  });

  it("preserva vírgula decimal e interpreta 12/69 como total de 69 parcelas", () => {
    const result = extractFinancialTransactions("consorcio 552,23 12/69 parcelas debito");

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      amount: 552.23,
      installments: 69,
      account: "Conta Corrente",
      category: "Consórcio",
      installmentCurrent: 12,
    });
  });

  it("interpreta parcela X de Y em qualquer categoria", () => {
    const result = extractFinancialTransactions("sofa 50 parcela 5 de 12");
    const legacy = parseMessage("sofa 50 parcela 5 de 12")!;

    expect(result.transactions[0]).toMatchObject({ amount: 50, installmentCurrent: 5, installments: 12 });
    expect(legacy).toMatchObject({ valor: 50, parcela: 5, totalParcelas: 12, parcelas: 12 });
  });

  it("extrai o valor do bem em carta de, total k e financiamento de", () => {
    expect(extractFinancialTransactions("consorcio parcela 552,23 12/69 carta de 30000").transactions[0].asset_value).toBe(30000);
    expect(extractFinancialTransactions("consorcio parcela 552,23 12/69 total 50k").transactions[0].asset_value).toBe(50000);
    expect(extractFinancialTransactions("financiamento de 150.000").transactions[0].asset_value).toBe(150000);
  });

  it("aceita ponto decimal e parcelas longas até 999", () => {
    const decimalWithPoint = extractFinancialTransactions("financiamento 552.23 em 360 parcelas");
    const legacyParser = parseMessage("consorcio 552,23 12/69 parcelas debito")!;

    expect(decimalWithPoint.transactions[0]).toMatchObject({ amount: 552.23, installments: 360 });
    expect(legacyParser).toMatchObject({ valor: 552.23, parcelas: 69 });
  });

  it("identifica despesas para outra pessoa como terceiros", () => {
    const forSomeone = extractFinancialTransactions("Comprei lanche 30 para o João");
    const onBehalf = extractFinancialTransactions("Uber 50 da Maria");

    expect(forSomeone.transactions[0].expense_owner).toBe("Terceiros");
    expect(onBehalf.transactions[0].expense_owner).toBe("Terceiros");
    expect(extractFinancialTransactions("Gastei 30 no lanche").transactions[0].expense_owner).toBe("Próprio");
    expect(extractFinancialTransactions("Comprei lanche 30 para casa").transactions[0].expense_owner).toBe("Próprio");
  });

  it("vincula o nome extraído a um contato cadastrado e limpa a descrição", () => {
    const result = extractFinancialTransactions("Comprei lanche 30 para o João", [{ id: "contact-joao", name: "João" }]);

    expect(result.transactions[0]).toMatchObject({
      description: "Lanche",
      expense_owner: "Terceiros",
      contact_id: "contact-joao",
      contact_name: "João",
    });
  });

  it("detecta cartão ou banco somente quando existe conta correspondente cadastrada", () => {
    const accounts = [
      { id: "nubank-card", name: "Nubank", type: "CREDIT_CARD" as const },
      { id: "itau-checking", name: "Itaú", type: "CHECKING_ACCOUNT" as const },
    ];
    expect(extractFinancialTransactions("lanche 35 no nubank", [], accounts).transactions[0].account_name).toBe("Nubank");
    expect(extractFinancialTransactions("uber 45 pelo Itaú", [], accounts).transactions[0].account_name).toBe("Itaú");
    expect(extractFinancialTransactions("lanche 35 no banco novo", [], accounts).transactions[0].account_name).toBeNull();
  });

  it("separa múltiplos gastos em um único texto", () => {
    const result = extractFinancialTransactions("gastei 20 de pão e 50 de uber");
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({ type: "EXPENSE", amount: 20, category: "Alimentação", description: "Pão" });
    expect(result.transactions[1]).toMatchObject({ type: "EXPENSE", amount: 50, category: "Transporte", description: "Uber" });
  });

  it("detecta transferências e conta pelo método informado", () => {
    const result = extractFinancialTransactions("transferi 1200 para a conta do aluguel em 3x");
    expect(result.transactions[0]).toMatchObject({ type: "TRANSFER", amount: 1200, installments: 3, account: null });
  });
});

describe("limite do cartão", () => {
  const c: Cartao = { id: "x", nome: "X", limite: 1000, fechamento: 5, vencimento: 12 };
  const hoje = new Date(2026, 9, 23); // 23/10 → fatura aberta = nov/2026
  const base = { tipo: "despesa" as const, categoria: "Compras", conta: "Crédito", cartao: "x", descricao: "t" };

  it("soma fatura aberta + parcelas futuras, ignora faturas fechadas", () => {
    const txs = [
      { ...base, id: "1", valor: 100, data: "2026-10-01" }, // fatura out (fechada)
      { ...base, id: "2", valor: 200, data: "2026-10-20" }, // fatura nov (aberta)
      { ...base, id: "3", valor: 300, data: "2026-12-20" }, // futura
    ];
    expect(limiteUsado(c, txs, [c], hoje)).toBe(500);
  });
});

describe("valores a receber de terceiros", () => {
  it("soma despesas vinculadas a contatos e ignora receitas e despesas pessoais", () => {
    const contacts = [{ id: "joao", name: "João" }, { id: "maria", name: "Maria" }];
    const transactions = [
      { id: "1", tipo: "despesa" as const, valor: 25, categoria: "Alimentação", conta: "Débito", descricao: "Lanche", data: "2026-10-23", contact_id: "joao" },
      { id: "2", tipo: "despesa" as const, valor: 50, categoria: "Transporte", conta: "Pix", descricao: "Uber", data: "2026-10-23", contact_id: "maria" },
      { id: "3", tipo: "despesa" as const, valor: 100, categoria: "Compras", conta: "Débito", descricao: "Pessoal", data: "2026-10-23" },
      { id: "4", tipo: "receita" as const, valor: 200, categoria: "Outros", conta: "Pix", descricao: "Reembolso", data: "2026-10-23", contact_id: "joao" },
    ];

    expect(totalAReceber(contacts, transactions)).toBe(75);
  });
});

describe("configurações do orçamento mensal", () => {
  it("usa R$ 2.000 como padrão e persiste um limite válido", () => {
    expect(loadFinanceSettings().monthly_spending_limit).toBe(2000);
    expect(updateMonthlySpendingLimit(2750)).toBe(true);
    expect(JSON.parse(localStorage.getItem("@FalaGrana:settings") ?? "{}")).toEqual({ monthly_spending_limit: 2750 });
    expect(loadFinanceSettings().monthly_spending_limit).toBe(2750);

    updateMonthlySpendingLimit(2000);
  });
});

describe("exclusão de cartão", () => {
  it("bloqueia quando há transações vinculadas e permite quando não há", () => {
    upsertCard({ nome: "Teste", limite: 500, fechamento: 1, vencimento: 10 });
    const novo = loadCards().find((k) => k.nome === "Teste")!;
    addTransaction({ tipo: "despesa", valor: 10, categoria: "Outros", conta: "Crédito", cartao: novo.id, descricao: "a", data: "2026-10-01" });
    expect(deleteCard(novo.id)).toBe(false);
    upsertCard({ nome: "Vazio", limite: 500, fechamento: 1, vencimento: 10 });
    const vazio = loadCards().find((k) => k.nome === "Vazio")!;
    expect(deleteCard(vazio.id)).toBe(true);
  });
});

describe("parcelas em grupo", () => {
  it("atualiza todos os itens de um mesmo grupo ao editar em massa", () => {
    const groupId = "group-update-test";
    addTransaction({ tipo: "despesa", valor: 200, categoria: "Compras", conta: "Crédito", cartao: "principal", descricao: "Notebook", data: "2026-01-15", installment_group_id: groupId }, 3);

    updateTransactionsByInstallmentGroupId(groupId, { categoria: "Eletrônicos", descricao: "Monitor", valor: 450 });

    const rows = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]").filter((t: any) => t.installment_group_id === groupId);
    expect(rows).toHaveLength(3);
    expect(rows.every((t: any) => t.categoria === "Eletrônicos")).toBe(true);
    expect(rows.every((t: any) => t.descricao === "Monitor")).toBe(true);
    expect(rows.every((t: any) => t.valor === 450)).toBe(true);
  });

  it("antecipa as últimas parcelas do grupo e atualiza valor e data", () => {
    const groupId = "group-advance-test";
    const base = { tipo: "despesa" as const, categoria: "Compras", conta: "Crédito", cartao: "principal", descricao: "Notebook", data: "2026-01-15", installment_group_id: groupId };
    addTransaction(base, 4);

    const rowsBefore = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]").filter((t: any) => t.installment_group_id === groupId).sort((a: any, b: any) => a.parcela - b.parcela);
    const current = rowsBefore[rowsBefore.length - 1];
    const today = new Date();

    anteciparParcelas(groupId, 2, 350, today);

    const rowsAfter = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]").filter((t: any) => t.installment_group_id === groupId).sort((a: any, b: any) => a.parcela - b.parcela);
    expect(rowsAfter.slice(-2).every((t: any) => t.data === today.toISOString().slice(0, 10))).toBe(true);
    expect(rowsAfter.slice(-2).every((t: any) => t.valor === 350)).toBe(true);
    expect(current.parcela).toBe(4);
  });
});

describe("entidade accounts e transações vinculadas", () => {
  it("persiste contas na entidade accounts com id, name e type", () => {
    const id = upsertTransactionAccount("Nubank Teste", "CREDIT_CARD");
    expect(id).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem("accounts") ?? "[]");
    const account = stored.find((item: any) => item.id === id);
    expect(account).toMatchObject({
      name: "Nubank Teste",
      type: "CREDIT_CARD",
    });
  });

  it("salva transações com account_id opcional (preenchido ou nulo)", () => {
    addTransaction({
      tipo: "despesa",
      valor: 85,
      categoria: "Alimentação",
      descricao: "Jantar",
      data: "2026-10-23",
      account_id: "conta-123",
    });
    addTransaction({
      tipo: "despesa",
      valor: 20,
      categoria: "Transporte",
      descricao: "Ônibus",
      data: "2026-10-23",
      account_id: null,
    });
    const txs = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
    const txLinked = txs.find((t: any) => t.descricao === "Jantar");
    const txUnlinked = txs.find((t: any) => t.descricao === "Ônibus");
    expect(txLinked.account_id).toBe("conta-123");
    expect(txUnlinked.account_id).toBeNull();
  });

  it("parser preenche account_id e account_name quando houver correspondência", () => {
    const accounts = [
      { id: "nubank-123", name: "Nubank", type: "CREDIT_CARD" as const },
    ];
    const match = extractFinancialTransactions("almoço 35 no nubank", [], accounts);
    expect(match.transactions[0].account_name).toBe("Nubank");
    expect(match.transactions[0].account_id).toBe("nubank-123");

    const noMatch = extractFinancialTransactions("almoço 35 no c6", [], accounts);
    expect(noMatch.transactions[0].account_name).toBeNull();
    expect(noMatch.transactions[0].account_id).toBeNull();
  });
});
describe("gestão de despesas recorrentes (Assinatura / Fixo)", () => {
  it("inclui 'Assinatura / Fixo' na lista de categorias padrão", () => {
    expect(CATEGORIAS).toContain("Assinatura / Fixo");
  });

  it("atribui is_recurring true por padrão apenas para a categoria Assinatura / Fixo", () => {
    addTransaction({
      tipo: "despesa",
      valor: 55.9,
      categoria: "Assinatura / Fixo",
      descricao: "Netflix Premium",
      data: "2026-10-15",
    });

    addTransaction({
      tipo: "despesa",
      valor: 120,
      categoria: "Alimentação",
      descricao: "Mercado Semanal",
      data: "2026-10-15",
    });

    const txs = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
    const sub = txs.find((t: any) => t.descricao === "Netflix Premium");
    const food = txs.find((t: any) => t.descricao === "Mercado Semanal");

    expect(sub.is_recurring).toBe(true);
    expect(food.is_recurring).toBeUndefined();
  });

  it("permite salvar Assinatura / Fixo com is_recurring: false explicitamente", () => {
    addTransaction({
      tipo: "despesa",
      valor: 34.9,
      categoria: "Assinatura / Fixo",
      descricao: "Streaming Teste",
      data: "2026-10-10",
      is_recurring: false,
    });

    const txs = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
    const sub = txs.find((t: any) => t.descricao === "Streaming Teste");
    expect(sub.is_recurring).toBe(false);
  });

  it("processarRecorrencias clona assinaturas do mês anterior para o mês atual atualizando a data", () => {
    // Adiciona assinatura no mês anterior (2026-09)
    addTransaction({
      tipo: "despesa",
      valor: 21.9,
      categoria: "Assinatura / Fixo",
      descricao: "Spotify Família",
      data: "2026-09-12",
      is_recurring: true,
      account_id: "nubank-card",
    });

    // Simula abertura no mês atual (2026-10)
    const hoje = new Date(2026, 9, 23); // 23 de Outubro de 2026
    const clonadas = processarRecorrencias(hoje);

    expect(clonadas.length).toBeGreaterThanOrEqual(1);
    const spotifyClone = clonadas.find((t) => t.descricao === "Spotify Família");
    expect(spotifyClone).toBeDefined();
    expect(spotifyClone?.data).toBe("2026-10-12");
    expect(spotifyClone?.is_recurring).toBe(true);
    expect(spotifyClone?.account_id).toBe("nubank-card");

    // Executar novamente no mesmo mês não deve duplicar
    const segundaExecucao = processarRecorrencias(hoje);
    const duplicadas = segundaExecucao.filter((t) => t.descricao === "Spotify Família");
    expect(duplicadas).toHaveLength(0);
  });

  it("cancelarRenovacaoAssinatura altera is_recurring para false no último lançamento", () => {
    addTransaction({
      tipo: "despesa",
      valor: 49.9,
      categoria: "Assinatura / Fixo",
      descricao: "Academia Smart",
      data: "2026-09-05",
      is_recurring: true,
    });

    const cancelou = cancelarRenovacaoAssinatura("Academia Smart");
    expect(cancelou).toBe(true);

    const txs = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
    const gym = txs.find((t: any) => t.descricao === "Academia Smart");
    expect(gym.is_recurring).toBe(false);

    // Na virada do mês, não deve clonar transações canceladas
    const hoje = new Date(2026, 9, 23);
    const clonadas = processarRecorrencias(hoje);
    expect(clonadas.some((t) => t.descricao === "Academia Smart")).toBe(false);
  });
});
describe("controle de status de pagamento (is_paid) e totais de terceiros", () => {
  it("atribui is_paid false por padrão a todas as novas transações e parcelas", () => {
    addTransaction({
      tipo: "despesa",
      valor: 100,
      categoria: "Compras",
      descricao: "Camisa",
      data: "2026-10-23",
    });

    addTransaction({
      tipo: "despesa",
      valor: 200,
      categoria: "Consórcio",
      descricao: "Consórcio Moto",
      data: "2026-10-23",
    }, 3);

    const txs = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
    const single = txs.find((t: any) => t.descricao === "Camisa");
    const installments = txs.filter((t: any) => t.descricao === "Consórcio Moto");

    expect(single.is_paid).toBe(false);
    expect(installments).toHaveLength(3);
    expect(installments.every((t: any) => t.is_paid === false)).toBe(true);
  });

  it("toggleTransactionPaid dá baixa exclusivamente na parcela específica sem alterar outras do grupo", () => {
    const groupId = "group-consorcio-paid-test";
    addTransaction({
      tipo: "despesa",
      valor: 300,
      categoria: "Consórcio",
      descricao: "Consórcio Auto",
      data: "2026-10-01",
      installment_group_id: groupId,
    }, 3);

    const txsBefore = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]")
      .filter((t: any) => t.installment_group_id === groupId)
      .sort((a: any, b: any) => a.parcela - b.parcela);

    const targetRow = txsBefore[0];
    const otherRow = txsBefore[1];

    const isNowPaid = toggleTransactionPaid(targetRow.id);
    expect(isNowPaid).toBe(true);

    const txsAfter = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]")
      .filter((t: any) => t.installment_group_id === groupId)
      .sort((a: any, b: any) => a.parcela - b.parcela);

    expect(txsAfter[0].is_paid).toBe(true);
    expect(txsAfter[1].is_paid).toBe(false);
    expect(txsAfter[2].is_paid).toBe(false);
  });

  it("totalAReceberMes e totalAReceberGeral consideram apenas itens pendentes e subtraem quando pago", () => {
    const contact = { id: "contact-lucas", name: "Lucas" };
    addTransaction({
      tipo: "despesa",
      valor: 40,
      categoria: "Alimentação",
      descricao: "Almoço Lucas",
      data: "2026-10-10",
      contact_id: contact.id,
      expense_owner: "Terceiros",
    });

    addTransaction({
      tipo: "despesa",
      valor: 60,
      categoria: "Transporte",
      descricao: "Uber Lucas Mês Passado",
      data: "2026-09-15",
      contact_id: contact.id,
      expense_owner: "Terceiros",
    });

    const currentMonth = "2026-10";
    const txs = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");

    // Lucas deve 40 no mês atual e 100 no total geral
    expect(totalAReceberMes(contact, txs, currentMonth)).toBe(40);
    expect(totalAReceberGeral(contact, txs)).toBe(100);

    // Dá baixa no almoço deste mês
    const almoco = txs.find((t: any) => t.descricao === "Almoço Lucas");
    toggleTransactionPaid(almoco.id);

    const txsAfter = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");

    // Agora este mês está quitado (0) e o geral reduziu para 60
    expect(totalAReceberMes(contact, txsAfter, currentMonth)).toBe(0);
    expect(totalAReceberGeral(contact, txsAfter)).toBe(60);
  });
});
describe("saldo atual", () => {
  const base = { categoria: "Outros", conta: "Pix" };
  const txs = [
    { ...base, id: "r1", tipo: "receita" as const, valor: 1000, descricao: "Salário", data: "2026-10-01" },
    { ...base, id: "d1", tipo: "despesa" as const, valor: 200, descricao: "Mercado", data: "2026-10-05" },
    { ...base, id: "d2", tipo: "despesa" as const, valor: 100, descricao: "Almoço João", data: "2026-10-06", contact_id: "joao" },
    { ...base, id: "d3", tipo: "despesa" as const, valor: 50, descricao: "Futura", data: "2026-12-01" },
  ];

  it("ignora gastos de terceiros e lançamentos futuros", () => {
    expect(calcularSaldoAtual(txs, "2026-10-23")).toBe(800);
  });

  it("não é afetado pelo total a receber de terceiros", () => {
    const before = calcularSaldoAtual(txs, "2026-10-23");
    expect(totalAReceber([{ id: "joao", name: "João" }], txs)).toBe(100);
    expect(calcularSaldoAtual(txs, "2026-10-23")).toBe(before);
  });
});
describe("extrato por período", () => {
  const base = { categoria: "Outros", conta: "Pix" };
  const txs = [
    { ...base, id: "a", tipo: "receita" as const, valor: 1000, descricao: "Salário", data: "2026-10-05" },
    { ...base, id: "b", tipo: "despesa" as const, valor: 300, descricao: "Mercado", data: "2026-10-23" },
    { ...base, id: "c", tipo: "despesa" as const, valor: 50, descricao: "Uber", data: "2026-10-23" },
    { ...base, id: "d", tipo: "despesa" as const, valor: 552.23, descricao: "Consórcio", data: "2031-07-23" },
  ];

  it("isola o mês e exclui parcelas de anos futuros", () => {
    const mes = transacoesDoMes(txs, "2026-10");
    expect(mes.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("agrupa por dia em ordem decrescente", () => {
    const dias = agruparPorDia(transacoesDoMes(txs, "2026-10"));
    expect(dias.map((d) => d.data)).toEqual(["2026-10-23", "2026-10-05"]);
    expect(dias[0].items).toHaveLength(2);
  });

  it("resume entradas, saídas e balanço do mês", () => {
    expect(resumoMensal(transacoesDoMes(txs, "2026-10"))).toEqual({ entradas: 1000, saidas: 350, balanco: 650 });
  });

  it("desloca meses atravessando o ano", () => {
    expect(deslocarMes("2026-01", -1)).toBe("2025-12");
    expect(deslocarMes("2026-12", 1)).toBe("2027-01");
  });
});

describe("resumo mensal separado", () => {
  it("isola gastos pessoais, a receber de terceiros pendente, total gasto com repasses e entradas", () => {
    const b = { categoria: "Outros", conta: "Pix", data: "2026-10-10" };
    const r = resumoMensalSeparado([
      { ...b, id: "1", tipo: "receita", valor: 1000, descricao: "Salário" },
      { ...b, id: "2", tipo: "despesa", valor: 200, descricao: "Meu" },
      { ...b, id: "3", tipo: "despesa", valor: 80, descricao: "Do João", contact_id: "j" },
      { ...b, id: "4", tipo: "despesa", valor: 20, descricao: "Do João pago", contact_id: "j", is_paid: true },
    ]);
    expect(r).toEqual({
      gastos: 200,
      aReceber: 80,
      repasseTerceiros: 100,
      totalGasto: 300,
      entradas: 1000,
    });
  });
});

describe("transações recentes do dashboard com isolamento mensal", () => {
  it("filtra apenas o mês atual, exclui gastos de terceiros, ordena decrescente e limita a 6", () => {
    const mes = "2026-10";
    const transactions = [
      { id: "1", tipo: "despesa" as const, valor: 50, categoria: "Alimentação", conta: "Pix", descricao: "Almoço", data: "2026-10-02" },
      { id: "2", tipo: "despesa" as const, valor: 80, categoria: "Transporte", conta: "Pix", descricao: "Uber amigo", data: "2026-10-15", contact_id: "c1" }, // terceiro
      { id: "3", tipo: "despesa" as const, valor: 120, categoria: "Alimentação", conta: "Pix", descricao: "Jantar", data: "2026-10-20" },
      { id: "4", tipo: "despesa" as const, valor: 500, categoria: "Consórcio", conta: "Pix", descricao: "Parcela 2031", data: "2031-05-10" }, // futuro
      { id: "5", tipo: "despesa" as const, valor: 30, categoria: "Lazer", conta: "Pix", descricao: "Cinema", data: "2026-10-05" },
      { id: "6", tipo: "receita" as const, valor: 3000, categoria: "Salário", conta: "Pix", descricao: "Salário", data: "2026-10-01" },
      { id: "7", tipo: "despesa" as const, valor: 90, categoria: "Saúde", conta: "Pix", descricao: "Farmácia", data: "2026-10-22" },
      { id: "8", tipo: "despesa" as const, valor: 40, categoria: "Alimentação", conta: "Pix", descricao: "Padaria", data: "2026-10-18" },
      { id: "9", tipo: "despesa" as const, valor: 15, categoria: "Lazer", conta: "Pix", descricao: "Café", data: "2026-10-12" },
    ];

    const recentes = transactions
      .filter((t) => t.data.startsWith(mes) && !t.contact_id)
      .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id))
      .slice(0, 6);

    // Deve conter no máximo 6 itens
    expect(recentes).toHaveLength(6);
    // Não pode conter a parcela futura de 2031 (id: 4)
    expect(recentes.some((t) => t.id === "4")).toBe(false);
    // Não pode conter o gasto de terceiro (id: 2)
    expect(recentes.some((t) => t.id === "2")).toBe(false);
    // Mais recente primeiro: id: 7 (2026-10-22)
    expect(recentes[0].id).toBe("7");
    // Segundo mais recente: id: 3 (2026-10-20)
    expect(recentes[1].id).toBe("3");
  });
});
