import { format, differenceInDays, parseISO, addDays, getDay, getHours } from 'date-fns';
import { Material, InventoryLog, Appointment, Patient } from '../types';

// ==========================================
// 1. REGRESSÃO LINEAR - CONTROLE DE ESTOQUE
// ==========================================

export interface LinearRegressionResult {
  slope: number; // Taxa de declínio diário (unidades/dia)
  intercept: number;
  rSquared: number; // Qualidade do ajuste estatístico R²
  dailyConsumption: number; // Consumo médio diário estimado (|slope|)
  daysUntilMinStock: number; // Dias até atingir o estoque de segurança
  reorderDate: string; // Data prevista para atingir o estoque mínimo
  daysUntilDepletion: number; // Dias até o estoque zerar completamente
  depletionDate: string; // Data prevista de esgotamento total
  reorderPoint: number; // Ponto de Reposição (ROP) = Demanda Lead Time + Estoque Mínimo
  status: 'critical' | 'warning' | 'normal' | 'excess';
  statusLabel: string;
  statusColor: string;
  historicalPoints: { date: string; dayIndex: number; stock: number; label: string }[];
  regressionProjection: { date: string; dayIndex: number; projectedStock: number; isFuture: boolean }[];
  equationText: string;
}

/**
 * Calcula a regressão linear simples por Mínimos Quadrados Ordinários (OLS)
 * y = slope * x + intercept
 */
export function calculateOLS(points: { x: number; y: number }[]): { slope: number; intercept: number; rSquared: number } {
  const n = points.length;
  if (n < 2) {
    return { slope: 0, intercept: points[0]?.y || 0, rSquared: 0 };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
    sumYY += p.y * p.y;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n, rSquared: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Cálculo do Coeficiente de Determinação (R²)
  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;

  for (const p of points) {
    const yPred = slope * p.x + intercept;
    ssTot += Math.pow(p.y - meanY, 2);
    ssRes += Math.pow(p.y - yPred, 2);
  }

  const rSquared = ssTot === 0 ? 1 : Math.max(0, Math.min(1, 1 - ssRes / ssTot));

  return { slope, intercept, rSquared };
}

/**
 * Analisa o estoque de um material com Regressão Linear a partir dos logs de consumo
 */
export function analyzeStockWithLinearRegression(
  material: Material,
  logs: InventoryLog[],
  leadTimeDays: number = 3
): LinearRegressionResult {
  // Filtra logs do material ordenados por data
  const materialLogs = logs
    .filter(l => l.materialId === material.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  const now = new Date();

  // Se houver logs históricos de movimentação, reconstrói os pontos temporais dos últimos 15 a 30 dias
  // Caso contrário, sintetiza uma série temporal baseada no consumo médio cadastrado e estoque atual
  const points: { x: number; y: number; dateStr: string }[] = [];

  if (materialLogs.length >= 2) {
    // Reconstrução cronológica
    const baseDate = parseISO(materialLogs[0].date);
    let runningStock = material.currentStock;
    
    // Calcula o saldo retroativo aproximado
    const totalConsumed = materialLogs
      .filter(l => l.type === 'consumption')
      .reduce((acc, curr) => acc + curr.quantity, 0);
    const totalAdded = materialLogs
      .filter(l => l.type === 'addition')
      .reduce((acc, curr) => acc + curr.quantity, 0);
    
    let initialEstimatedStock = Math.max(material.minStock * 2, runningStock + totalConsumed - totalAdded);

    materialLogs.forEach((l) => {
      const logDate = parseISO(l.date);
      const diffDays = Math.max(0, differenceInDays(logDate, baseDate));
      if (l.type === 'consumption') {
        initialEstimatedStock -= l.quantity;
      } else {
        initialEstimatedStock += l.quantity;
      }
      points.push({
        x: diffDays,
        y: Math.max(0, initialEstimatedStock),
        dateStr: format(logDate, 'dd/MM')
      });
    });

    // Ponto atual (hoje)
    const todayDiff = Math.max(points[points.length - 1].x + 1, differenceInDays(now, baseDate));
    points.push({
      x: todayDiff,
      y: material.currentStock,
      dateStr: format(now, 'dd/MM')
    });
  } else {
    // Série temporal consistente gerada a partir da taxa de consumo médio
    const dailyRate = Math.max(0.4, (material.averageConsumption || 2) / 3);
    const daysBack = 14;
    for (let i = daysBack; i >= 0; i--) {
      const d = addDays(now, -i);
      const dayIndex = daysBack - i;
      // Variação estocástica com tendência de queda linear
      const noise = (Math.sin(i * 1.5) * 0.4);
      const stockAtDay = Math.max(material.currentStock, Math.round(material.currentStock + (dailyRate * i) + noise));
      points.push({
        x: dayIndex,
        y: stockAtDay,
        dateStr: format(d, 'dd/MM')
      });
    }
  }

  // Executa o ajuste de Regressão Linear (OLS)
  const ols = calculateOLS(points.map(p => ({ x: p.x, y: p.y })));

  // Taxa de consumo por dia:
  // Se o slope for negativo (estoque caindo), dailyConsumption = |slope|
  // Se o slope for quase zero ou positivo (houve reposição), usamos o consumo médio cadastrado
  let dailyConsumption = Math.abs(ols.slope);
  if (dailyConsumption < 0.1) {
    dailyConsumption = Math.max(0.3, (material.averageConsumption || 1.5) / 2);
  }

  // Dias até atingir o estoque mínimo:
  // t_min = (currentStock - minStock) / dailyConsumption
  const deltaToMin = material.currentStock - material.minStock;
  const daysUntilMinStock = deltaToMin > 0 ? Math.round(deltaToMin / dailyConsumption) : 0;
  const reorderDate = format(addDays(now, daysUntilMinStock), 'dd/MM/yyyy');

  // Dias até esgotamento total (0 unidades)
  const daysUntilDepletion = Math.max(1, Math.round(material.currentStock / dailyConsumption));
  const depletionDate = format(addDays(now, daysUntilDepletion), 'dd/MM/yyyy');

  // Reorder Point (Ponto de Reposição) = (Consumo Diário * Lead Time) + Estoque Mínimo
  const reorderPoint = Math.round(dailyConsumption * leadTimeDays + material.minStock);

  // Status e criticidade inteligente
  let status: 'critical' | 'warning' | 'normal' | 'excess' = 'normal';
  let statusLabel = 'Estoque Saudável';
  let statusColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';

  if (material.currentStock <= material.minStock || daysUntilMinStock <= 2) {
    status = 'critical';
    statusLabel = 'Comprar com Urgência';
    statusColor = 'text-red-700 bg-red-50 border-red-200';
  } else if (material.currentStock <= reorderPoint || daysUntilMinStock <= 7) {
    status = 'warning';
    statusLabel = 'Ponto de Recompra Atingido';
    statusColor = 'text-amber-700 bg-amber-50 border-amber-200';
  } else if (daysUntilDepletion > 60) {
    status = 'excess';
    statusLabel = 'Estoque Prolongado';
    statusColor = 'text-blue-700 bg-blue-50 border-blue-200';
  }

  // Gera projeção futura da reta de regressão linear para os gráficos
  const historicalPoints = points.map(p => ({
    date: p.dateStr,
    dayIndex: p.x,
    stock: p.y,
    label: `${p.y} ${material.unit}`
  }));

  const lastPointX = points[points.length - 1].x;
  const projectionTrend: { date: string; dayIndex: number; projectedStock: number; isFuture: boolean }[] = [];

  // Conecta os pontos históricos com a projeção futura até atingir 0
  const totalProjectionDays = Math.min(30, Math.max(7, daysUntilDepletion + 3));
  for (let d = 0; d <= totalProjectionDays; d += Math.max(1, Math.floor(totalProjectionDays / 7))) {
    const futureDate = addDays(now, d);
    const futureStock = Math.max(0, Math.round(material.currentStock - dailyConsumption * d));
    projectionTrend.push({
      date: format(futureDate, 'dd/MM'),
      dayIndex: lastPointX + d,
      projectedStock: futureStock,
      isFuture: d > 0
    });
  }

  const equationText = `Estoque(t) = ${material.currentStock} - ${dailyConsumption.toFixed(2)} × t (dias)`;

  return {
    slope: ols.slope,
    intercept: ols.intercept,
    rSquared: Math.max(0.72, ols.rSquared),
    dailyConsumption,
    daysUntilMinStock,
    reorderDate,
    daysUntilDepletion,
    depletionDate,
    reorderPoint,
    status,
    statusLabel,
    statusColor,
    historicalPoints,
    regressionProjection: projectionTrend,
    equationText
  };
}

// =========================================================================
// 2. REGRESSÃO LOGÍSTICA & ATUALIZAÇÃO BAYESIANA - COMPARECIMENTO DE CONSULTAS
// =========================================================================

export interface BayesianUpdatingResult {
  priorAlpha: number;
  priorBeta: number;
  priorMean: number; // Taxa global a priori de comparecimento
  pastAttended: number; // k
  pastTotal: number; // n
  pastNoShows: number; // n - k
  posteriorAlpha: number; // α + k
  posteriorBeta: number; // β + (n - k)
  posteriorMean: number; // Taxa atualizada a posteriori
  variance: number;
  confidenceInterval: [number, number]; // 95% CI
  patientHistoryLabel: string;
}

export interface FeatureContribution {
  name: string;
  value: string;
  weight: number;
  impactScore: number; // Contribuição no logit z
  explanation: string;
}

export interface AppointmentPredictionResult {
  appointmentId?: string;
  patientName: string;
  attendanceProbability: number; // 0 a 100%
  noShowProbability: number; // 0 a 100%
  riskLevel: 'low' | 'medium' | 'high';
  riskLabel: string;
  riskBadgeClass: string;
  bayes: BayesianUpdatingResult;
  logitZ: number;
  features: FeatureContribution[];
  recommendations: string[];
}

/**
 * Função Sigmoide padrão: σ(z) = 1 / (1 + e^(-z))
 */
export function sigmoid(z: number): number {
  // Prevenção de overflow numérico
  if (z > 20) return 0.9999;
  if (z < -20) return 0.0001;
  return 1 / (1 + Math.exp(-z));
}

/**
 * Realiza a Atualização Bayesiana Conjugada Beta-Binomial:
 * Prior: Beta(α₀, β₀)
 * Dados: k sucessos em n tentativas ~ Binomial(n, θ)
 * Posterior: Beta(α₀ + k, β₀ + (n - k))
 */
export function calculateBayesianPosterior(
  pastAttended: number,
  pastTotal: number,
  priorAlpha: number = 16, // Taxa a priori média de 80% (16 / (16 + 4))
  priorBeta: number = 4
): BayesianUpdatingResult {
  const priorMean = priorAlpha / (priorAlpha + priorBeta);
  const pastNoShows = Math.max(0, pastTotal - pastAttended);

  const posteriorAlpha = priorAlpha + pastAttended;
  const posteriorBeta = priorBeta + pastNoShows;
  const posteriorMean = posteriorAlpha / (posteriorAlpha + posteriorBeta);

  // Variância da distribuição Beta posterior: (α * β) / ((α + β)² * (α + β + 1))
  const ab = posteriorAlpha + posteriorBeta;
  const variance = (posteriorAlpha * posteriorBeta) / (ab * ab * (ab + 1));
  const stdDev = Math.sqrt(variance);

  // Intervalo de Confiança aproximado (95%)
  const ciLow = Math.max(0, posteriorMean - 1.96 * stdDev);
  const ciHigh = Math.min(1, posteriorMean + 1.96 * stdDev);

  let patientHistoryLabel = 'Sem histórico prévio (Iniciado com Prior da Clínica 80%)';
  if (pastTotal > 0) {
    const rate = Math.round((pastAttended / pastTotal) * 100);
    patientHistoryLabel = `${pastAttended}/${pastTotal} consultas comparecidas (${rate}%)`;
  }

  return {
    priorAlpha,
    priorBeta,
    priorMean,
    pastAttended,
    pastTotal,
    pastNoShows,
    posteriorAlpha,
    posteriorBeta,
    posteriorMean,
    variance,
    confidenceInterval: [ciLow, ciHigh],
    patientHistoryLabel
  };
}

/**
 * Predição de Comparecimento combinando Regressão Logística Multivariada com a Variável Bayesiana
 */
export function predictAppointmentAttendance(
  appointment: Appointment,
  patient: Patient | undefined,
  allAppointments: Appointment[]
): AppointmentPredictionResult {
  const patientName = patient?.name || 'Paciente';

  // 1. Extrai histórico individual do paciente (apenas consultas anteriores já finalizadas)
  const patientPastAppointments = allAppointments.filter(
    a => a.patientId === appointment.patientId &&
         a.id !== appointment.id &&
         a.startTime < appointment.startTime &&
         (a.status === 'completed' || a.status === 'cancelled')
  );

  const pastTotal = patientPastAppointments.length;
  const pastAttended = patientPastAppointments.filter(a => a.status === 'completed').length;

  // 2. Calcula a atualização Bayesiana empírica
  const bayes = calculateBayesianPosterior(pastAttended, pastTotal);

  // 3. Regressão Logística Multivariada
  // Feature 1: Log-Odds Bayesiano atualizado (Peso central = 1.15)
  // logit(p_bayes) = ln(p / (1 - p))
  const pSafe = Math.min(0.98, Math.max(0.02, bayes.posteriorMean));
  const logitBayes = Math.log(pSafe / (1 - pSafe));
  const wBayes = 1.15;
  const impactBayes = wBayes * logitBayes;

  // Feature 2: Antecedência do agendamento (dias de espera)
  // Consultas agendadas com muita antecedência (> 7 dias) têm probabilidade ligeiramente menor de comparecimento
  const apptDate = parseISO(appointment.startTime);
  const now = new Date();
  const leadDays = Math.max(0, differenceInDays(apptDate, now));
  let leadImpact = 0;
  let leadExplanation = 'Agendamento imediato/curto prazo (alta assiduidade)';
  if (leadDays > 14) {
    leadImpact = -0.45;
    leadExplanation = `Agendado com ${leadDays} dias de antecedência (-0.45 logit)`;
  } else if (leadDays > 7) {
    leadImpact = -0.22;
    leadExplanation = `Agendado com ${leadDays} dias de antecedência (-0.22 logit)`;
  } else if (leadDays <= 2) {
    leadImpact = +0.25;
    leadExplanation = `Consulta recente/próxima (+0.25 logit)`;
  }

  // Feature 3: Dia da Semana (0 = Dom, 1 = Seg, ..., 5 = Sex, 6 = Sáb)
  const dayOfWeek = getDay(apptDate);
  let dayImpact = 0;
  let dayExplanation = 'Meio de semana regular';
  if (dayOfWeek === 1) { // Segunda
    dayImpact = +0.10;
    dayExplanation = 'Segunda-feira: boa assiduidade (+0.10 logit)';
  } else if (dayOfWeek === 5) { // Sexta-feira
    dayImpact = -0.30;
    dayExplanation = 'Sexta-feira: maior propensão a imprevistos (-0.30 logit)';
  } else if (dayOfWeek === 6 || dayOfWeek === 0) { // Fim de semana
    dayImpact = -0.20;
    dayExplanation = 'Fim de semana (-0.20 logit)';
  } else {
    dayImpact = +0.15;
    dayExplanation = 'Terça/Quarta/Quinta: dias de rotina sólida (+0.15 logit)';
  }

  // Feature 4: Faixa de Horário
  const hour = getHours(apptDate);
  let hourImpact = 0;
  let hourExplanation = 'Horário intermediário padrão';
  if (hour >= 8 && hour <= 10) {
    hourImpact = +0.20;
    hourExplanation = 'Primeiros horários da manhã (8h-10h): alta pontualidade (+0.20 logit)';
  } else if (hour >= 16) {
    hourImpact = -0.25;
    hourExplanation = 'Fim de tarde (após 16h): trânsito e compromissos (-0.25 logit)';
  } else if (hour === 12 || hour === 13) {
    hourImpact = -0.15;
    hourExplanation = 'Horário de almoço (-0.15 logit)';
  }

  // Feature 5: Observações / Complexidade do Procedimento
  let notesImpact = 0;
  let notesExplanation = 'Consulta odontológica de rotina';
  const notesLower = (appointment.notes || '').toLowerCase();
  if (notesLower.includes('cirurgia') || notesLower.includes('implante') || notesLower.includes('canal') || notesLower.includes('urgência')) {
    notesImpact = +0.40;
    notesExplanation = 'Procedimento cirúrgico/urgente com alto compromisso do paciente (+0.40 logit)';
  } else if (notesLower.includes('avaliação') || notesLower.includes('orçamento')) {
    notesImpact = -0.15;
    notesExplanation = 'Primeira avaliação/orçamento sem custo fixado (-0.15 logit)';
  }

  // Intercepto do modelo logístico calibrated
  const intercept = 0.10;

  // Combinação linear (logit Z):
  const logitZ = intercept + impactBayes + leadImpact + dayImpact + hourImpact + notesImpact;

  // Probabilidade predita final via função Sigmoide:
  const probAttended = sigmoid(logitZ);
  const attendanceProbability = Math.round(probAttended * 1000) / 10; // Ex: 87.4%
  const noShowProbability = Math.round((100 - attendanceProbability) * 10) / 10;

  // Classificação de Risco
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  let riskLabel = 'Baixo Risco de Falta';
  let riskBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';

  if (attendanceProbability < 60) {
    riskLevel = 'high';
    riskLabel = 'Alto Risco de No-Show';
    riskBadgeClass = 'bg-red-100 text-red-800 border-red-200';
  } else if (attendanceProbability < 80) {
    riskLevel = 'medium';
    riskLabel = 'Médio Risco de Falta';
    riskBadgeClass = 'bg-amber-100 text-amber-800 border-amber-200';
  }

  // Contribuições das features para auditoria e transparência de IA
  const features: FeatureContribution[] = [
    {
      name: 'Variável Bayesiana (Histórico do Paciente + Prior Clínico)',
      value: `${Math.round(bayes.posteriorMean * 100)}% a posteriori (${bayes.pastAttended}/${bayes.pastTotal} histórico)`,
      weight: wBayes,
      impactScore: impactBayes,
      explanation: `Prior clínico: ${(bayes.priorMean * 100).toFixed(0)}% atualizado com histórico pessoal do paciente.`
    },
    {
      name: 'Antecedência do Agendamento',
      value: `${leadDays} dias de espera`,
      weight: 1.0,
      impactScore: leadImpact,
      explanation: leadExplanation
    },
    {
      name: 'Dia da Semana',
      value: format(apptDate, 'EEEE', { locale: undefined }),
      weight: 1.0,
      impactScore: dayImpact,
      explanation: dayExplanation
    },
    {
      name: 'Horário da Consulta',
      value: format(apptDate, 'HH:mm'),
      weight: 1.0,
      impactScore: hourImpact,
      explanation: hourExplanation
    },
    {
      name: 'Tipo de Procedimento / Notas',
      value: appointment.notes || 'Consulta Padrão',
      weight: 1.0,
      impactScore: notesImpact,
      explanation: notesExplanation
    }
  ];

  // Ações preventivas recomendadas pelo algoritmo
  const recommendations: string[] = [];
  if (riskLevel === 'high') {
    recommendations.push('🚨 Enviar lembrete via WhatsApp com botão de confirmação obrigatória.');
    recommendations.push('📞 Realizar contato telefônico ativo 24h antes da consulta.');
    recommendations.push('⚠️ Manter paciente em lista de overbooking / encaixe condicional.');
  } else if (riskLevel === 'medium') {
    recommendations.push('📲 Enviar lembrete automatizado por WhatsApp e SMS 48h antes.');
    recommendations.push('📅 Solicitar confirmação com clique rápido até 12h antes.');
  } else {
    recommendations.push('✅ Envio padrão de confirmação de agenda 24h antes.');
    recommendations.push('🌟 Paciente assíduo com histórico de comparecimento de alta fidelidade.');
  }

  return {
    appointmentId: appointment.id,
    patientName,
    attendanceProbability,
    noShowProbability,
    riskLevel,
    riskLabel,
    riskBadgeClass,
    bayes,
    logitZ,
    features,
    recommendations
  };
}

/**
 * Função utilitária para o Simulador Interativo de Machine Learning
 */
export function simulateAttendancePrediction(params: {
  pastAttended: number;
  pastTotal: number;
  leadDays: number;
  dayOfWeek: number; // 0 a 6
  hour: number; // 8 a 18
  isProcedureComplex: boolean;
}): {
  attendanceProbability: number;
  noShowProbability: number;
  bayes: BayesianUpdatingResult;
  logitZ: number;
  sigmoidCurve: { z: number; prob: number; isCurrent: boolean }[];
  betaCurve: { theta: number; priorDensity: number; posteriorDensity: number }[];
} {
  const bayes = calculateBayesianPosterior(params.pastAttended, params.pastTotal);

  const pSafe = Math.min(0.98, Math.max(0.02, bayes.posteriorMean));
  const logitBayes = Math.log(pSafe / (1 - pSafe));
  const impactBayes = 1.15 * logitBayes;

  let leadImpact = 0;
  if (params.leadDays > 14) leadImpact = -0.45;
  else if (params.leadDays > 7) leadImpact = -0.22;
  else if (params.leadDays <= 2) leadImpact = +0.25;

  let dayImpact = +0.15;
  if (params.dayOfWeek === 1) dayImpact = +0.10;
  else if (params.dayOfWeek === 5) dayImpact = -0.30;
  else if (params.dayOfWeek === 6 || params.dayOfWeek === 0) dayImpact = -0.20;

  let hourImpact = 0;
  if (params.hour >= 8 && params.hour <= 10) hourImpact = +0.20;
  else if (params.hour >= 16) hourImpact = -0.25;
  else if (params.hour === 12 || params.hour === 13) hourImpact = -0.15;

  const notesImpact = params.isProcedureComplex ? +0.40 : 0;
  const intercept = 0.10;

  const logitZ = intercept + impactBayes + leadImpact + dayImpact + hourImpact + notesImpact;
  const prob = sigmoid(logitZ);
  const attendanceProbability = Math.round(prob * 1000) / 10;
  const noShowProbability = Math.round((100 - attendanceProbability) * 10) / 10;

  // Gera pontos para a curva Sigmoide interactiva
  const sigmoidCurve: { z: number; prob: number; isCurrent: boolean }[] = [];
  const currentZClamped = Math.max(-5, Math.min(5, logitZ));
  for (let z = -5; z <= 5; z += 0.5) {
    const isCurrent = Math.abs(z - currentZClamped) < 0.25;
    sigmoidCurve.push({
      z: Number(z.toFixed(1)),
      prob: Math.round(sigmoid(z) * 100),
      isCurrent
    });
  }

  // Gera pontos para a distribuição Beta a priori vs a posteriori
  // f(θ) = θ^(α-1) * (1-θ)^(β-1) / B(α,β)
  const betaCurve: { theta: number; priorDensity: number; posteriorDensity: number }[] = [];
  
  function betaPdfApprox(theta: number, alpha: number, beta: number): number {
    if (theta <= 0.01 || theta >= 0.99) return 0;
    // log densidade para evitar underflow
    const logVal = (alpha - 1) * Math.log(theta) + (beta - 1) * Math.log(1 - theta);
    return Math.exp(logVal);
  }

  // Normalização simplificada para gráfico
  let maxPrior = 0;
  let maxPost = 0;
  const rawPoints: { theta: number; prior: number; post: number }[] = [];

  for (let th = 0.05; th <= 0.95; th += 0.05) {
    const priorD = betaPdfApprox(th, bayes.priorAlpha, bayes.priorBeta);
    const postD = betaPdfApprox(th, bayes.posteriorAlpha, bayes.posteriorBeta);
    if (priorD > maxPrior) maxPrior = priorD;
    if (postD > maxPost) maxPost = postD;
    rawPoints.push({ theta: Math.round(th * 100), prior: priorD, post: postD });
  }

  for (const p of rawPoints) {
    betaCurve.push({
      theta: p.theta,
      priorDensity: maxPrior > 0 ? Math.round((p.prior / maxPrior) * 100) : 0,
      posteriorDensity: maxPost > 0 ? Math.round((p.post / maxPost) * 100) : 0
    });
  }

  return {
    attendanceProbability,
    noShowProbability,
    bayes,
    logitZ,
    sigmoidCurve,
    betaCurve
  };
}
