import { Patient, Material, Appointment, InventoryLog } from '../types';
import { addDays, subDays, format } from 'date-fns';

export const INITIAL_REALISTIC_PATIENTS: Omit<Patient, 'id'>[] = [
  { name: 'Dr. Lucas Mendonça', phone: '(11) 98765-4321', email: 'lucas.mendonca@gmail.com' },
  { name: 'Mariana Duarte Costa', phone: '(11) 97654-3210', email: 'mariana.costa@hotmail.com' },
  { name: 'Roberto Carlos da Silva', phone: '(11) 96543-2109', email: 'roberto.carlos@uol.com.br' },
  { name: 'Camila Rodrigues Lima', phone: '(11) 95432-1098', email: 'camila.lima@outlook.com' },
  { name: 'Felipe Augusto Santos', phone: '(11) 94321-0987', email: 'felipe.santos@gmail.com' },
  { name: 'Beatriz Almeida Prado', phone: '(11) 93210-9876', email: 'beatriz.prado@gmail.com' },
  { name: 'Juliana Pires Martins', phone: '(11) 92109-8765', email: 'juliana.martins@yahoo.com.br' },
  { name: 'Thiago Nogueira Ramos', phone: '(11) 91098-7654', email: 'thiago.ramos@empresa.com' },
  { name: 'Fernanda Soares Castro', phone: '(11) 90987-6543', email: 'fernanda.castro@gmail.com' },
  { name: 'Gabriel Henrique Moura', phone: '(11) 99876-5432', email: 'gabriel.moura@gmail.com' },
  { name: 'Larissa Monteiro Cunha', phone: '(11) 98765-1234', email: 'larissa.cunha@gmail.com' },
  { name: 'Eduardo Silveira Gomes', phone: '(11) 97654-2345', email: 'eduardo.gomes@gmail.com' },
  { name: 'Carolina Esteves Dias', phone: '(11) 96543-3456', email: 'carolina.dias@gmail.com' },
  { name: 'Matheus Barbosa Paiva', phone: '(11) 95432-4567', email: 'matheus.paiva@gmail.com' },
  { name: 'Vanessa Cardoso Faria', phone: '(11) 94321-5678', email: 'vanessa.faria@gmail.com' },
  { name: 'Bruno Guimarães Melo', phone: '(11) 93210-6789', email: 'bruno.melo@gmail.com' },
  { name: 'Patrícia Borges Leite', phone: '(11) 92109-7890', email: 'patricia.leite@gmail.com' },
  { name: 'Renato Furtado Vieira', phone: '(11) 91098-8901', email: 'renato.vieira@gmail.com' },
  { name: 'Aline Correia Toledo', phone: '(11) 90987-9012', email: 'aline.toledo@gmail.com' },
  { name: 'Marcelo Queiroz Fontes', phone: '(11) 99876-0123', email: 'marcelo.fontes@gmail.com' },
];

export const INITIAL_REALISTIC_MATERIALS: Omit<Material, 'id'>[] = [
  {
    name: 'Anestésico Lidocaína 2% c/ Epinefrina',
    unit: 'Caixa c/ 50 tubetes',
    currentStock: 4,
    minStock: 6,
    averageConsumption: 1.2
  },
  {
    name: 'Resina Composta Filtek Z350 XT A2',
    unit: 'Seringa 4g',
    currentStock: 14,
    minStock: 5,
    averageConsumption: 0.6
  },
  {
    name: 'Luvas Nitrílicas Sem Pó (Tamanho M)',
    unit: 'Caixa c/ 100 unidades',
    currentStock: 8,
    minStock: 10,
    averageConsumption: 1.8
  },
  {
    name: 'Máscaras Cirúrgicas Descartáveis Triplas',
    unit: 'Caixa c/ 50 unidades',
    currentStock: 6,
    minStock: 12,
    averageConsumption: 2.1
  },
  {
    name: 'Sugador Odontológico Cirúrgico',
    unit: 'Pacote c/ 40 unidades',
    currentStock: 11,
    minStock: 8,
    averageConsumption: 1.1
  },
  {
    name: 'Álcool Isopropílico 70% Hospitalar',
    unit: 'Frasco 1 Litro',
    currentStock: 5,
    minStock: 3,
    averageConsumption: 0.4
  },
  {
    name: 'Afastador Labial Flexível Transparente',
    unit: 'Unidade Autoclavável',
    currentStock: 7,
    minStock: 4,
    averageConsumption: 0.3
  }
];

/**
 * Gera logs diários de consumo para alimentar com alta aderência a Regressão Linear
 */
export function generateRealisticInventoryLogs(
  materials: { id: string; currentStock: number; averageConsumption: number }[],
  userId: string
): Omit<InventoryLog, 'id'>[] {
  const logs: Omit<InventoryLog, 'id'>[] = [];
  const now = new Date();

  materials.forEach(mat => {
    const dailyMean = mat.averageConsumption || 1.0;
    // Cria 14 dias de histórico de consumo
    for (let d = 14; d >= 1; d--) {
      const logDate = subDays(now, d);
      // Variação de consumo diário
      const dayVariation = (d % 3 === 0) ? Math.ceil(dailyMean * 1.4) : Math.max(1, Math.floor(dailyMean * 0.9));
      
      logs.push({
        materialId: mat.id,
        quantity: dayVariation,
        type: 'consumption',
        date: logDate.toISOString(),
        userId
      });
    }

    // Se o estoque atual for razoável, adicionamos uma entrada de compra há 16 dias
    logs.push({
      materialId: mat.id,
      quantity: Math.round(mat.currentStock + dailyMean * 14),
      type: 'addition',
      date: subDays(now, 16).toISOString(),
      userId
    });
  });

  return logs;
}

/**
 * Gera consultas históricas (passadas) e consultas futuras para alimentar
 * o histórico Bayesiano de cada paciente e demonstrar a predição de comparecimento
 */
export function generateRealisticAppointments(
  patientIds: string[],
  dentistId: string
): Omit<Appointment, 'id'>[] {
  const appointments: Omit<Appointment, 'id'>[] = [];
  const now = new Date();

  // Perfis estocásticos por faixa de paciente para demonstrar a atualização Bayesiana:
  // - Pacientes 0 a 7: Altamente assíduos (95% presença no passado) -> Posterior Beta alto (~92%)
  // - Pacientes 8 a 13: Faltosos frequentes (25% presença no passado) -> Posterior Beta despenca (~45%)
  // - Pacientes 14 a 19: Pacientes novos com 0 ou 1 consulta -> Mantém equilíbrio com o Prior da clínica (80%)

  patientIds.forEach((pId, idx) => {
    let pastApptCount = 0;
    let targetAttendanceRate = 0.8;

    if (idx < 8) {
      pastApptCount = 4 + (idx % 3); // 4 a 6 consultas
      targetAttendanceRate = 0.95; // Quase nunca falta
    } else if (idx < 14) {
      pastApptCount = 4 + (idx % 2); // 4 a 5 consultas
      targetAttendanceRate = 0.25; // Faltoso crônico
    } else {
      pastApptCount = idx % 2; // 0 ou 1 consulta
      targetAttendanceRate = 0.80; // Novo
    }

    // Gera consultas passadas
    for (let k = 1; k <= pastApptCount; k++) {
      const daysAgo = 5 + k * 8; // Dias no passado
      const pastDate = subDays(now, daysAgo);
      const isPresent = Math.random() < targetAttendanceRate;
      const status: 'completed' | 'cancelled' = isPresent ? 'completed' : 'cancelled';

      const start = new Date(pastDate);
      start.setHours(9 + (k % 7), 0, 0, 0);
      const end = new Date(start);
      end.setHours(start.getHours() + 1);

      appointments.push({
        patientId: pId,
        dentistId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        status,
        notes: isPresent ? 'Consulta realizada com sucesso' : 'Paciente não compareceu (No-Show)'
      });
    }

    // Gera consultas agendadas futuras (para serem avaliadas pelo modelo de ML em tempo real)
    const futureDays = (idx % 12) + 1; // 1 a 12 dias no futuro
    const futureDate = addDays(now, futureDays);
    const futureStart = new Date(futureDate);
    const hourSlot = 8 + (idx % 9);
    futureStart.setHours(hourSlot, (idx % 2 === 0 ? 0 : 30), 0, 0);
    const futureEnd = new Date(futureStart);
    futureEnd.setHours(futureStart.getHours() + 1);

    const procedureTypes = [
      'Restauração em Resina Composta',
      'Profilaxia e Aplicação de Flúor',
      'Tratamento Endodôntico (Canal)',
      'Instalação de Implante Dentário',
      'Avaliação Inicial e Planejamento',
      'Clareamento Dental a Laser',
      'Cirurgia de Exodontia de Siso',
      'Manutenção Ortodôntica'
    ];

    appointments.push({
      patientId: pId,
      dentistId,
      startTime: futureStart.toISOString(),
      endTime: futureEnd.toISOString(),
      status: 'scheduled',
      notes: procedureTypes[idx % procedureTypes.length]
    });
  });

  return appointments;
}
