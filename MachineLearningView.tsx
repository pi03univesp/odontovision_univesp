import React, { useState, useMemo } from 'react';
import { Material, InventoryLog, Appointment, Patient } from '../types';
import { 
  analyzeStockWithLinearRegression, 
  predictAppointmentAttendance, 
  simulateAttendancePrediction,
  LinearRegressionResult,
  AppointmentPredictionResult
} from '../utils/mlModels';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ReferenceLine, 
  AreaChart, 
  Area 
} from 'recharts';
import { 
  TrendingDown, 
  Cpu, 
  Brain, 
  AlertTriangle, 
  CheckCircle2, 
  Calendar, 
  Package, 
  Info, 
  Sparkles, 
  Sliders, 
  Clock, 
  UserCheck, 
  UserX, 
  Zap,
  Target,
  ChevronRight
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MachineLearningViewProps {
  materials: Material[];
  inventoryLogs: InventoryLog[];
  appointments: Appointment[];
  patients: Patient[];
  onSeed?: () => void;
  isSeeding?: boolean;
}

export function MachineLearningView({
  materials,
  inventoryLogs,
  appointments,
  patients,
  onSeed,
  isSeeding
}: MachineLearningViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'inventory_ml' | 'appointments_ml' | 'simulator'>('inventory_ml');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(materials[0]?.id || '');
  const [selectedApptId, setSelectedApptId] = useState<string | null>(null);

  // Análise de Regressão Linear para todos os materiais
  const stockAnalyses = useMemo(() => {
    return materials.map(mat => ({
      material: mat,
      analysis: analyzeStockWithLinearRegression(mat, inventoryLogs)
    }));
  }, [materials, inventoryLogs]);

  // Material atualmente selecionado para inspeção gráfica detalhada
  const currentMaterialAnalysis = useMemo(() => {
    const found = stockAnalyses.find(s => s.material.id === selectedMaterialId);
    return found || stockAnalyses[0];
  }, [stockAnalyses, selectedMaterialId]);

  // Análise de Regressão Logística e Atualização Bayesiana para agendamentos futuros
  const futureAppointmentsWithML = useMemo(() => {
    // Filtra consultas agendadas (scheduled)
    const scheduled = appointments
      .filter(a => a.status === 'scheduled')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return scheduled.map(appt => {
      const patient = patients.find(p => p.id === appt.patientId);
      const prediction = predictAppointmentAttendance(appt, patient, appointments);
      return {
        appointment: appt,
        patient,
        prediction
      };
    });
  }, [appointments, patients]);

  // Consulta selecionada para o modal de detalhes estatísticos
  const selectedApptDetail = useMemo(() => {
    if (!selectedApptId) return null;
    return futureAppointmentsWithML.find(item => item.appointment.id === selectedApptId);
  }, [futureAppointmentsWithML, selectedApptId]);

  // Estado do Simulador Interativo de Machine Learning
  const [simPastAttended, setSimPastAttended] = useState<number>(4);
  const [simPastTotal, setSimPastTotal] = useState<number>(5);
  const [simLeadDays, setSimLeadDays] = useState<number>(4);
  const [simDayOfWeek, setSimDayOfWeek] = useState<number>(2); // Terça-feira
  const [simHour, setSimHour] = useState<number>(10);
  const [simIsComplex, setSimIsComplex] = useState<boolean>(false);

  const simulationResult = useMemo(() => {
    return simulateAttendancePrediction({
      pastAttended: simPastAttended,
      pastTotal: simPastTotal,
      leadDays: simLeadDays,
      dayOfWeek: simDayOfWeek,
      hour: simHour,
      isProcedureComplex: simIsComplex
    });
  }, [simPastAttended, simPastTotal, simLeadDays, simDayOfWeek, simHour, simIsComplex]);

  // Estatísticas agregadas de ML
  const kpis = useMemo(() => {
    const criticalMaterials = stockAnalyses.filter(s => s.analysis.status === 'critical').length;
    const warningMaterials = stockAnalyses.filter(s => s.analysis.status === 'warning').length;
    
    const avgProb = futureAppointmentsWithML.length > 0 
      ? Math.round(futureAppointmentsWithML.reduce((acc, curr) => acc + curr.prediction.attendanceProbability, 0) / futureAppointmentsWithML.length)
      : 80;

    const highRiskAppts = futureAppointmentsWithML.filter(a => a.prediction.riskLevel === 'high').length;

    return { criticalMaterials, warningMaterials, avgProb, highRiskAppts };
  }, [stockAnalyses, futureAppointmentsWithML]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Banner com descrição do módulo de IA - Mobile-Optimized */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[11px] px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <Brain size={13} className="text-blue-400 animate-pulse" />
                Inteligência Preditiva
              </span>
              <span className="bg-purple-500/20 text-purple-300 border border-purple-400/30 text-[11px] px-2.5 py-0.5 rounded-full font-semibold">
                OLS + Bayes
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Centro de Machine Learning</h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Modelagem preditiva em tempo real: preveja o ponto ótimo de compra de insumos e a taxa de comparecimento
              de cada paciente utilizando inferência estatística rigorosa.
            </p>
          </div>
        </div>

        {/* Sub-navegação interna dos modelos (Responsivo para touch em mobile) */}
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 mt-4 sm:mt-6 pt-4 border-t border-white/10">
          <button
            onClick={() => setActiveSubTab('inventory_ml')}
            className={`px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between sm:justify-start gap-2 transition-all cursor-pointer min-h-[44px] ${
              activeSubTab === 'inventory_ml'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <Package size={16} className="shrink-0" />
              <span className="truncate">ML Estoque (Regressão Linear)</span>
            </div>
            {kpis.criticalMaterials > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold ml-1">
                {kpis.criticalMaterials}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('appointments_ml')}
            className={`px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between sm:justify-start gap-2 transition-all cursor-pointer min-h-[44px] ${
              activeSubTab === 'appointments_ml'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <Calendar size={16} className="shrink-0" />
              <span className="truncate">ML Agenda (Logística + Bayes)</span>
            </div>
            {kpis.highRiskAppts > 0 && (
              <span className="bg-amber-500 text-slate-900 text-[10px] px-2 py-0.5 rounded-full font-bold ml-1">
                {kpis.highRiskAppts}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('simulator')}
            className={`px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center sm:justify-start gap-2 transition-all cursor-pointer min-h-[44px] ${
              activeSubTab === 'simulator'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Sliders size={16} className="shrink-0" />
            <span>Simulador Interativo de IA</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Rápidos - 2 colunas em mobile para melhor visualização */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1 sm:mb-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Compras Imediatas</span>
            <AlertTriangle className="text-red-500 shrink-0" size={16} />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{kpis.criticalMaterials} materiais</p>
          <p className="text-[11px] text-red-600 mt-0.5 truncate">&le; 2 dias de cobertura</p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1 sm:mb-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Ponto Reposição</span>
            <Package className="text-amber-500 shrink-0" size={16} />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{kpis.warningMaterials} materiais</p>
          <p className="text-[11px] text-amber-600 mt-0.5 truncate">Comprar em até 7 dias</p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1 sm:mb-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Presença Média</span>
            <Target className="text-emerald-500 shrink-0" size={16} />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600">{kpis.avgProb}%</p>
          <p className="text-[11px] text-gray-500 mt-0.5 truncate">Projeção da agenda</p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 mb-1 sm:mb-2">
            <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider truncate">Risco No-Show</span>
            <UserX className="text-orange-500 shrink-0" size={16} />
          </div>
          <p className="text-xl sm:text-2xl font-bold text-orange-600">{kpis.highRiskAppts} consultas</p>
          <p className="text-[11px] text-orange-600 mt-0.5 truncate">Exigem confirmação</p>
        </div>
      </div>

      {/* ======================================================== */}
      {/* ABA 1: ML DE ESTOQUE (REGRESSÃO LINEAR OLS) */}
      {/* ======================================================== */}
      {activeSubTab === 'inventory_ml' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Card explicativo do modelo */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 sm:p-4 flex items-start gap-2.5 sm:gap-3">
            <Info className="text-blue-600 shrink-0 mt-0.5" size={18} />
            <div className="text-xs sm:text-sm text-blue-900 leading-relaxed">
              <span className="font-bold">Regressão Linear no Estoque:</span> O modelo calcula a reta
              <code className="bg-blue-100 px-1 py-0.5 mx-1 rounded text-blue-800 font-mono text-[11px]">Stock(t) = S₀ - β×t</code>
              analisando a velocidade de consumo histórico (<code className="font-mono text-[11px]">β</code>) para determinar com precisão a data de compra e o esgotamento total.
            </div>
          </div>

          {/* Gráfico Detalhado e Painel do Material Selecionado */}
          {currentMaterialAnalysis && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-4 sm:space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-gray-100">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900">{currentMaterialAnalysis.material.name}</h2>
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border ${currentMaterialAnalysis.analysis.statusColor}`}>
                      {currentMaterialAnalysis.analysis.statusLabel}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Unidade: <span className="font-semibold text-gray-700">{currentMaterialAnalysis.material.unit}</span> | 
                    Ajuste R²: <span className="font-semibold text-emerald-600">{(currentMaterialAnalysis.analysis.rSquared * 100).toFixed(1)}%</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <label htmlFor="material-select" className="text-xs font-semibold text-gray-500 whitespace-nowrap">Material:</label>
                  <select
                    id="material-select"
                    value={selectedMaterialId}
                    onChange={(e) => setSelectedMaterialId(e.target.value)}
                    className="flex-1 md:flex-initial bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 min-h-[42px]"
                  >
                    {stockAnalyses.map(s => (
                      <option key={s.material.id} value={s.material.id}>
                        {s.material.name} ({s.material.currentStock} {s.material.unit})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Indicadores do Material Selecionado - 2x2 em mobile */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <span className="text-[10px] sm:text-xs text-gray-500 uppercase font-semibold block">Consumo Diário (β)</span>
                  <p className="text-base sm:text-xl font-bold text-blue-600 mt-0.5">
                    {currentMaterialAnalysis.analysis.dailyConsumption.toFixed(2)} <span className="text-[11px] font-normal text-gray-600">/dia</span>
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <span className="text-[10px] sm:text-xs text-gray-500 uppercase font-semibold block">Ponto de Compra</span>
                  <p className="text-base sm:text-xl font-bold text-amber-600 mt-0.5 truncate">
                    {currentMaterialAnalysis.analysis.daysUntilMinStock <= 0 
                      ? 'Hoje (Urgente)' 
                      : `em ${currentMaterialAnalysis.analysis.daysUntilMinStock} dias`}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">{currentMaterialAnalysis.analysis.reorderDate}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <span className="text-[10px] sm:text-xs text-gray-500 uppercase font-semibold block">Duração Total</span>
                  <p className="text-base sm:text-xl font-bold text-gray-900 mt-0.5">
                    {currentMaterialAnalysis.analysis.daysUntilDepletion} dias
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">até {currentMaterialAnalysis.analysis.depletionDate}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <span className="text-[10px] sm:text-xs text-gray-500 uppercase font-semibold block">Ponto Reposição (ROP)</span>
                  <p className="text-base sm:text-xl font-bold text-indigo-600 mt-0.5">
                    {currentMaterialAnalysis.analysis.reorderPoint} un
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">Lead Time: 3 dias</p>
                </div>
              </div>

              {/* Gráfico da Reta de Regressão Linear */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2 sm:mb-3">
                  <h3 className="text-xs sm:text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <TrendingDown size={16} className="text-blue-600 shrink-0" />
                    Projeção Linear OLS & Limiar Crítico
                  </h3>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1 text-gray-600">
                      <span className="w-2.5 h-0.5 bg-blue-600 inline-block" />
                      Projeção Linear
                    </span>
                    <span className="flex items-center gap-1 text-red-600">
                      <span className="w-2.5 h-0.5 bg-red-500 border-t border-dashed inline-block" />
                      Mínimo ({currentMaterialAnalysis.material.minStock})
                    </span>
                  </div>
                </div>

                <div className="h-60 sm:h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={currentMaterialAnalysis.analysis.regressionProjection}
                      margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip 
                        formatter={(val: any) => [`${val} ${currentMaterialAnalysis.material.unit}`, 'Estoque']}
                        labelFormatter={(label) => `Data: ${label}`}
                      />
                      <ReferenceLine 
                        y={currentMaterialAnalysis.material.minStock} 
                        stroke="#ef4444" 
                        strokeDasharray="4 4" 
                      />
                      <Line 
                        type="monotone" 
                        dataKey="projectedStock" 
                        stroke="#2563eb" 
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: '#2563eb' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Versão Mobile (Cards Responsivos) e Desktop (Tabela) */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-3.5 sm:p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-xs sm:text-sm flex items-center gap-1.5">
                <Cpu size={15} className="text-blue-600" />
                Matriz Preditiva de Todos os Materiais
              </h3>
              <span className="text-[11px] text-gray-500 font-medium">{stockAnalyses.length} insumos</span>
            </div>

            {/* Visualização em Cards no Mobile (evita scroll horizontal forçado) */}
            <div className="md:hidden divide-y divide-gray-100">
              {stockAnalyses.map(({ material, analysis }) => (
                <div key={material.id} className="p-3.5 space-y-2 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{material.name}</p>
                      <p className="text-[11px] text-gray-500">Unidade: {material.unit}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border shrink-0 ${analysis.statusColor}`}>
                      {analysis.statusLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    <div>
                      <span className="text-[10px] text-gray-400 font-semibold uppercase block">Estoque</span>
                      <p className="font-bold text-gray-900">{material.currentStock} <span className="text-[10px] font-normal text-gray-500">(mín: {material.minStock})</span></p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 font-semibold uppercase block">Consumo/Dia</span>
                      <p className="font-bold text-blue-700">{analysis.dailyConsumption.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 font-semibold uppercase block">Comprar em</span>
                      <p className="font-bold text-amber-700">
                        {analysis.daysUntilMinStock <= 0 ? 'Hoje' : `${analysis.daysUntilMinStock}d`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-gray-500">
                      Duração: <strong>{analysis.daysUntilDepletion} dias</strong> (até {analysis.depletionDate})
                    </span>
                    <button
                      onClick={() => setSelectedMaterialId(material.id)}
                      className="text-xs text-blue-600 font-bold hover:underline cursor-pointer py-1 px-2"
                    >
                      Ver Gráfico &rarr;
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Visualização em Tabela no Desktop/Tablet */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs font-bold text-gray-500 uppercase bg-gray-50/50">
                    <th className="px-5 py-3.5">Material</th>
                    <th className="px-4 py-3.5">Estoque Atual</th>
                    <th className="px-4 py-3.5">Mínimo</th>
                    <th className="px-4 py-3.5">Consumo/Dia (β)</th>
                    <th className="px-4 py-3.5">Ajuste R²</th>
                    <th className="px-4 py-3.5">Momento de Compra</th>
                    <th className="px-4 py-3.5">Duração Prevista</th>
                    <th className="px-4 py-3.5">Status Preditivo</th>
                    <th className="px-4 py-3.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stockAnalyses.map(({ material, analysis }) => (
                    <tr 
                      key={material.id} 
                      className={`hover:bg-blue-50/40 transition-colors ${selectedMaterialId === material.id ? 'bg-blue-50/60' : ''}`}
                    >
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-gray-900">{material.name}</p>
                        <p className="text-xs text-gray-500">{material.unit}</p>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-gray-900">
                        {material.currentStock}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600">
                        {material.minStock}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-blue-700 font-medium">
                        {analysis.dailyConsumption.toFixed(2)}/dia
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                          {(analysis.rSquared * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-gray-900">
                          {analysis.daysUntilMinStock <= 0 ? 'Imediato' : `em ${analysis.daysUntilMinStock} dias`}
                        </p>
                        <p className="text-[11px] text-gray-500">{analysis.reorderDate}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-gray-800">{analysis.daysUntilDepletion} dias</p>
                        <p className="text-[11px] text-gray-500">até {analysis.depletionDate}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-bold border inline-block ${analysis.statusColor}`}>
                          {analysis.statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          onClick={() => setSelectedMaterialId(material.id)}
                          className="text-xs text-blue-600 font-semibold hover:text-blue-800 hover:underline cursor-pointer"
                        >
                          Ver Projeção &rarr;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ABA 2: ML DE AGENDAMENTOS (REGRESSÃO LOGÍSTICA + BAYES) */}
      {/* ======================================================== */}
      {activeSubTab === 'appointments_ml' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Card explicativo do modelo */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3.5 sm:p-4 flex items-start gap-2.5 sm:gap-3">
            <Sparkles className="text-purple-600 shrink-0 mt-0.5" size={18} />
            <div className="text-xs sm:text-sm text-purple-900 leading-relaxed">
              <span className="font-bold">Regressão Logística & Variável Bayesiana:</span> Calcula a probabilidade
              individual de presença através da função sigmoide <code className="bg-purple-100 px-1 py-0.5 rounded text-purple-900 font-mono text-[11px]">σ(z) = 1/(1+e^(-z))</code>,
              onde o histórico anterior do paciente atualiza dinamicamente o prior da clínica através da distribuição Beta conjugada.
            </div>
          </div>

          {/* Lista de Consultas Agendadas com Predições */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-3.5 sm:p-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-gray-900 text-xs sm:text-sm flex items-center gap-1.5">
                  <Calendar size={15} className="text-blue-600" />
                  Previsão de Comparecimento da Agenda Futura
                </h3>
                <p className="text-[11px] text-gray-500">Probabilidades calculadas em tempo real para cada consulta</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  &gt;80% Baixo
                </span>
                <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  60-80% Médio
                </span>
                <span className="font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                  &lt;60% Alto
                </span>
              </div>
            </div>

            {futureAppointmentsWithML.length === 0 ? (
              <div className="p-8 sm:p-12 text-center space-y-3">
                <Calendar className="mx-auto text-gray-300" size={40} />
                <p className="text-gray-600 font-medium text-sm">Nenhum agendamento futuro encontrado.</p>
                <p className="text-xs text-gray-400">Novos agendamentos cadastrados na agenda serão avaliados automaticamente pelo modelo.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {futureAppointmentsWithML.map(({ appointment, patient, prediction }) => {
                  const date = parseISO(appointment.startTime);
                  return (
                    <div 
                      key={appointment.id} 
                      className="p-3.5 sm:p-5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="bg-slate-100 text-slate-800 p-2 sm:p-3 rounded-xl text-center min-w-[55px] sm:min-w-[65px] shrink-0">
                          <p className="text-[10px] uppercase font-bold text-slate-500">{format(date, 'MMM', { locale: ptBR })}</p>
                          <p className="text-lg sm:text-2xl font-black">{format(date, 'dd')}</p>
                          <p className="text-[10px] font-semibold text-slate-600">{format(date, 'HH:mm')}</p>
                        </div>

                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h4 className="font-bold text-gray-900 text-sm sm:text-base truncate">{patient?.name || 'Paciente'}</h4>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${prediction.riskBadgeClass}`}>
                              {prediction.riskLabel}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 font-medium truncate">
                            {appointment.notes || 'Consulta Padrão'}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                            <span>Posterior: <strong>{(prediction.bayes.posteriorMean * 100).toFixed(0)}%</strong></span>
                            <span>•</span>
                            <span>Histórico: <strong>{prediction.bayes.pastAttended}/{prediction.bayes.pastTotal} presenças</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* Medidor visual de probabilidade e botão no mobile */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-6 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100">
                        <div className="text-left sm:text-right">
                          <div className="flex items-center gap-2 sm:block">
                            <span className="text-[10px] text-gray-400 font-semibold uppercase sm:block">Presença</span>
                            <span className={`text-xl sm:text-2xl font-black ${
                              prediction.attendanceProbability >= 80 ? 'text-emerald-600' :
                              prediction.attendanceProbability >= 60 ? 'text-amber-600' : 'text-red-600'
                            }`}>
                              {prediction.attendanceProbability}%
                            </span>
                          </div>
                          <div className="w-24 sm:w-32 h-1.5 bg-gray-200 rounded-full mt-1 overflow-hidden hidden sm:block ml-auto">
                            <div 
                              className={`h-full rounded-full ${
                                prediction.attendanceProbability >= 80 ? 'bg-emerald-500' :
                                prediction.attendanceProbability >= 60 ? 'bg-amber-500' : 'bg-red-500'
                              }`} 
                              style={{ width: `${prediction.attendanceProbability}%` }}
                            />
                          </div>
                        </div>

                        <button
                          onClick={() => setSelectedApptId(appointment.id)}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 py-2 px-3 rounded-xl font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer min-h-[38px]"
                        >
                          Auditoria ML
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Modal de Detalhes Estatísticos e Explicabilidade - Mobile Scroll Friendly */}
          {selectedApptDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm">
              <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[88vh]">
                <div className="p-4 sm:p-6 bg-gradient-to-r from-slate-900 to-indigo-900 text-white flex items-start justify-between">
                  <div>
                    <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                      Explicabilidade de Machine Learning
                    </span>
                    <h3 className="text-lg sm:text-xl font-bold mt-1.5">{selectedApptDetail.patient?.name}</h3>
                    <p className="text-[11px] text-slate-300">
                      {format(parseISO(selectedApptDetail.appointment.startTime), "dd/MM/yyyy 'às' HH:mm")}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedApptId(null)}
                    className="text-white/70 hover:text-white text-xl font-bold p-1 cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6">
                  {/* Score Principal */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <p className="text-[10px] uppercase font-semibold text-gray-500">Predição Sigmoide σ(z)</p>
                      <p className="text-2xl sm:text-3xl font-black text-gray-900 mt-0.5">
                        {selectedApptDetail.prediction.attendanceProbability}%
                      </p>
                      <p className="text-[11px] text-gray-500">Risco No-Show: <strong>{selectedApptDetail.prediction.noShowProbability}%</strong></p>
                    </div>
                    <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${selectedApptDetail.prediction.riskBadgeClass}`}>
                      {selectedApptDetail.prediction.riskLabel}
                    </span>
                  </div>

                  {/* Detalhamento da Variável Bayesiana */}
                  <div className="space-y-2">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <Brain size={16} className="text-purple-600" />
                      Variável Bayesiana: Conjugada Beta-Binomial
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-100">
                        <span className="text-[10px] text-purple-700 font-semibold uppercase block">Prior Global</span>
                        <p className="text-base font-bold text-purple-900 mt-0.5">
                          {(selectedApptDetail.prediction.bayes.priorMean * 100).toFixed(0)}%
                        </p>
                        <p className="text-[9px] text-purple-600">Beta(16, 4)</p>
                      </div>

                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-600 font-semibold uppercase block">Histórico</span>
                        <p className="text-base font-bold text-slate-900 mt-0.5">
                          {selectedApptDetail.prediction.bayes.pastAttended}/{selectedApptDetail.prediction.bayes.pastTotal}
                        </p>
                        <p className="text-[9px] text-slate-500">presenças</p>
                      </div>

                      <div className="bg-indigo-50 p-2.5 rounded-lg border border-indigo-100">
                        <span className="text-[10px] text-indigo-700 font-semibold uppercase block">Posterior Beta</span>
                        <p className="text-base font-bold text-indigo-900 mt-0.5">
                          {(selectedApptDetail.prediction.bayes.posteriorMean * 100).toFixed(0)}%
                        </p>
                        <p className="text-[9px] text-indigo-600">Atualizado</p>
                      </div>
                    </div>
                  </div>

                  {/* Decomposição dos Pesos (Feature Contributions) */}
                  <div className="space-y-2">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-900">Decomposição das Variáveis</h4>
                    <div className="space-y-1.5">
                      {selectedApptDetail.prediction.features.map((feat, idx) => (
                        <div key={idx} className="p-2.5 bg-gray-50 rounded-lg border border-gray-100 text-xs flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-gray-800 truncate">{feat.name}</p>
                            <p className="text-[10px] text-gray-500 truncate">{feat.explanation}</p>
                          </div>
                          <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] shrink-0 ${
                            feat.impactScore >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {feat.impactScore >= 0 ? `+${feat.impactScore.toFixed(2)}` : feat.impactScore.toFixed(2)} z
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Ações Preventivas Recomendadas */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs sm:text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <Zap size={15} className="text-amber-500" />
                      Ações Preventivas Recomendadas
                    </h4>
                    {selectedApptDetail.prediction.recommendations.map((rec, idx) => (
                      <div key={idx} className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs font-medium text-amber-900">
                        {rec}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 sm:p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
                  <button
                    onClick={() => setSelectedApptId(null)}
                    className="w-full sm:w-auto px-5 py-2.5 bg-gray-900 text-white font-semibold text-xs rounded-xl hover:bg-gray-800 transition-colors cursor-pointer min-h-[44px]"
                  >
                    Fechar Auditoria
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* ABA 3: SIMULADOR INTERATIVO DE MACHINE LEARNING */}
      {/* ======================================================== */}
      {activeSubTab === 'simulator' && (
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 sm:p-4 flex items-start gap-2.5 sm:gap-3">
            <Sliders className="text-indigo-600 shrink-0 mt-0.5" size={18} />
            <div className="text-xs sm:text-sm text-indigo-900 leading-relaxed">
              <span className="font-bold">Laboratório de Simulação Interativa:</span> Altere os parâmetros abaixo para
              ver em tempo real a curva Sigmoide da Regressão Logística e a Distribuição Beta recalculando a probabilidade de presença.
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Painel de Controles */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-4 sm:space-y-5">
              <h3 className="font-bold text-gray-900 text-sm sm:text-base flex items-center gap-2 border-b border-gray-100 pb-2 sm:pb-3">
                <Sliders size={16} className="text-indigo-600" />
                Parâmetros do Paciente
              </h3>

              {/* Histórico do Paciente */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-gray-700">
                  <label htmlFor="sim-past-total">Total Consultas Passadas:</label>
                  <span className="text-blue-600 font-bold">{simPastTotal} consultas</span>
                </div>
                <input 
                  id="sim-past-total"
                  type="range" 
                  min="0" 
                  max="12" 
                  value={simPastTotal}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setSimPastTotal(val);
                    if (simPastAttended > val) setSimPastAttended(val);
                  }}
                  className="w-full h-2.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-gray-700">
                  <label htmlFor="sim-past-attended">Presenças Confirmadas:</label>
                  <span className="text-emerald-600 font-bold">{simPastAttended} de {simPastTotal}</span>
                </div>
                <input 
                  id="sim-past-attended"
                  type="range" 
                  min="0" 
                  max={simPastTotal} 
                  value={simPastAttended}
                  onChange={(e) => setSimPastAttended(Number(e.target.value))}
                  className="w-full h-2.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  disabled={simPastTotal === 0}
                />
                <p className="text-[11px] text-gray-500">
                  {simPastTotal === 0 ? 'Sem histórico prévio (usa prior da clínica)' : `Taxa histórica: ${Math.round((simPastAttended / simPastTotal) * 100)}%`}
                </p>
              </div>

              {/* Antecedência */}
              <div className="space-y-1.5 pt-2 border-t border-gray-100">
                <div className="flex justify-between text-xs font-semibold text-gray-700">
                  <label htmlFor="sim-lead-days">Antecedência (Espera):</label>
                  <span className="text-indigo-600 font-bold">{simLeadDays} dias</span>
                </div>
                <input 
                  id="sim-lead-days"
                  type="range" 
                  min="0" 
                  max="30" 
                  value={simLeadDays}
                  onChange={(e) => setSimLeadDays(Number(e.target.value))}
                  className="w-full h-2.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              {/* Dia da Semana */}
              <div className="space-y-1.5">
                <label htmlFor="sim-day-of-week" className="text-xs font-semibold text-gray-700 block">Dia da Semana:</label>
                <select
                  id="sim-day-of-week"
                  value={simDayOfWeek}
                  onChange={(e) => setSimDayOfWeek(Number(e.target.value))}
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-500 min-h-[42px]"
                >
                  <option value={1}>Segunda-feira (Alta assiduidade)</option>
                  <option value={2}>Terça-feira (Rotina sólida)</option>
                  <option value={3}>Quarta-feira (Rotina sólida)</option>
                  <option value={4}>Quinta-feira (Rotina sólida)</option>
                  <option value={5}>Sexta-feira (Maior risco de imprevisto)</option>
                  <option value={6}>Sábado (Fim de semana)</option>
                </select>
              </div>

              {/* Horário */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-gray-700">
                  <label htmlFor="sim-hour">Horário da Consulta:</label>
                  <span className="text-blue-600 font-bold">{simHour}:00h</span>
                </div>
                <input 
                  id="sim-hour"
                  type="range" 
                  min="8" 
                  max="18" 
                  value={simHour}
                  onChange={(e) => setSimHour(Number(e.target.value))}
                  className="w-full h-2.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              {/* Complexidade */}
              <div className="pt-2 border-t border-gray-100">
                <label className="flex items-center gap-2.5 cursor-pointer py-1 min-h-[40px]">
                  <input 
                    type="checkbox" 
                    checked={simIsComplex} 
                    onChange={(e) => setSimIsComplex(e.target.checked)} 
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-xs font-semibold text-gray-700">Procedimento Cirúrgico / Complexo</span>
                </label>
              </div>
            </div>

            {/* Painel de Resultados do Simulador com Gráficos */}
            <div className="lg:col-span-2 space-y-4 sm:space-y-6">
              {/* Card de Resultado da Probabilidade */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
                <div className="text-center sm:text-left w-full sm:w-auto">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500 block">Probabilidade de Comparecimento</span>
                  <div className="flex items-baseline justify-center sm:justify-start gap-2 mt-1">
                    <span className={`text-3xl sm:text-4xl font-black ${
                      simulationResult.attendanceProbability >= 80 ? 'text-emerald-600' :
                      simulationResult.attendanceProbability >= 60 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {simulationResult.attendanceProbability}%
                    </span>
                    <span className="text-xs text-gray-500">
                      (No-Show: <strong>{simulationResult.noShowProbability}%</strong>)
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1">
                    Logit z acumulado: <code className="font-mono bg-gray-100 px-1 py-0.5 rounded text-gray-800">{simulationResult.logitZ.toFixed(2)}</code>
                  </p>
                </div>

                <div className="bg-slate-50 p-3 sm:p-4 rounded-xl border border-slate-200 text-center w-full sm:w-auto min-w-[180px]">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Posterior Bayesiano</p>
                  <p className="text-xl sm:text-2xl font-bold text-indigo-700 mt-0.5">
                    {(simulationResult.bayes.posteriorMean * 100).toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-slate-500">Beta({simulationResult.bayes.posteriorAlpha}, {simulationResult.bayes.posteriorBeta})</p>
                </div>
              </div>

              {/* Gráfico 1: Curva Sigmoide da Regressão Logística */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-3 sm:space-y-4">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <Target size={15} className="text-blue-600" />
                    Função Logística Sigmoide: σ(z) = 1 / (1 + e^(-z))
                  </h4>
                  <p className="text-[11px] text-gray-500">A linha vertical indica o ponto calculado para a simulação atual</p>
                </div>

                <div className="h-48 sm:h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={simulationResult.sigmoidCurve} margin={{ top: 10, right: 15, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="z" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                      <Tooltip formatter={(val: any) => [`${val}%`, 'Probabilidade']} labelFormatter={(l) => `Logit z: ${l}`} />
                      <ReferenceLine 
                        x={Number(Math.max(-5, Math.min(5, simulationResult.logitZ)).toFixed(1))} 
                        stroke="#dc2626" 
                        strokeWidth={2}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="prob" 
                        stroke="#4f46e5" 
                        strokeWidth={2.5} 
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Gráfico 2: Distribuição Beta (Prior vs Posterior) */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <Brain size={15} className="text-purple-600" />
                      Atualização Bayesiana (Prior vs Posterior)
                    </h4>
                    <p className="text-[11px] text-gray-500">Refinamento da expectativa clínica pelo histórico do usuário</p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="flex items-center gap-1 text-gray-500">
                      <span className="w-2.5 h-0.5 bg-gray-400 inline-block" />
                      Prior (80%)
                    </span>
                    <span className="flex items-center gap-1 text-purple-700 font-semibold">
                      <span className="w-2.5 h-0.5 bg-purple-600 inline-block" />
                      Posterior
                    </span>
                  </div>
                </div>

                <div className="h-48 sm:h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={simulationResult.betaCurve} margin={{ top: 10, right: 15, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="theta" unit="%" tick={{ fontSize: 10 }} />
                      <YAxis tick={false} />
                      <Tooltip formatter={(val: any, name: any) => [`${val}%`, name === 'posteriorDensity' ? 'Densidade Posterior' : 'Densidade Prior']} labelFormatter={(l) => `θ = ${l}%`} />
                      <Area 
                        type="monotone" 
                        dataKey="priorDensity" 
                        stroke="#94a3b8" 
                        fill="#f1f5f9" 
                        fillOpacity={0.6} 
                        strokeDasharray="4 4"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="posteriorDensity" 
                        stroke="#9333ea" 
                        fill="#fae8ff" 
                        fillOpacity={0.7} 
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
