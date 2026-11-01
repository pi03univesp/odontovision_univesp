import React, { useState, useEffect, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  getDoc, 
  setDoc, 
  getDocFromServer 
} from 'firebase/firestore';
import { 
  LayoutDashboard, 
  Calendar, 
  Package, 
  Users, 
  LogOut, 
  Plus, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  ChevronLeft, 
  ChevronRight, 
  Menu, 
  X,
  Brain,
  Sparkles,
  TrendingDown,
  Info,
  Sliders,
  Zap,
  Target,
  UserCheck,
  UserX,
  RefreshCw,
  Phone,
  Mail,
  Trash2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line 
} from 'recharts';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { auth, db } from './firebase';
import { UserProfile, Patient, Appointment, Material, InventoryLog } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { MachineLearningView } from './components/MachineLearningView';
import { 
  analyzeStockWithLinearRegression, 
  predictAppointmentAttendance,
  AppointmentPredictionResult 
} from './utils/mlModels';
import { 
  INITIAL_REALISTIC_PATIENTS, 
  INITIAL_REALISTIC_MATERIALS, 
  generateRealisticInventoryLogs, 
  generateRealisticAppointments 
} from './utils/mockData';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Error Handling Spec
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Reusable UI Components with touch-friendly targets
const Button = ({ 
  className, 
  variant = 'primary', 
  size = 'md', 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; 
  size?: 'sm' | 'md' | 'lg' 
}) => {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 active:bg-gray-200',
    danger: 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700',
  };
  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs min-h-[36px]',
    md: 'px-4 py-2 text-sm min-h-[42px]',
    lg: 'px-5 py-2.5 text-base min-h-[48px]',
  };
  return (
    <button 
      className={cn('rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer touch-manipulation', variants[variant], sizes[size], className)} 
      {...props} 
    />
  );
};

const Card = ({ children, className, ...props }: { children: React.ReactNode; className?: string; [key: string]: any }) => (
  <div className={cn('bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden', className)} {...props}>
    {children}
  </div>
);

const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    className={cn('w-full px-3.5 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm min-h-[42px]', className)} 
    {...props} 
  />
);

const Select = ({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select 
    className={cn('w-full px-3.5 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white text-sm min-h-[42px]', className)} 
    {...props}
  >
    {children}
  </select>
);

// Main App Component
export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'agenda' | 'inventory' | 'patients' | 'ml'>('dashboard');
  
  // Mobile drawer: closed by default on small screens
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  // Raw Database States
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);

  // =========================================================================
  // DEDUPLICAÇÃO CANÔNICA DE DADOS (Resolve duplicatas visualmente e nos cálculos)
  // =========================================================================

  // Deduplica pacientes pelo nome limpo
  const uniquePatients = useMemo(() => {
    const seen = new Set<string>();
    const result: Patient[] = [];
    for (const p of patients) {
      const key = p.name ? p.name.trim().toLowerCase() : p.id;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(p);
      }
    }
    return result;
  }, [patients]);

  // Deduplica materiais pelo nome limpo
  const uniqueMaterials = useMemo(() => {
    const seen = new Set<string>();
    const result: Material[] = [];
    for (const m of materials) {
      const key = m.name ? m.name.trim().toLowerCase() : m.id;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(m);
      }
    }
    return result;
  }, [materials]);

  // Deduplica agendamentos por Paciente + Horário exato (minuto a minuto)
  const uniqueAppointments = useMemo(() => {
    // Mapeia IDs para os nomes canônicos de pacientes
    const patientNameMap = new Map<string, string>();
    for (const p of patients) {
      patientNameMap.set(p.id, p.name ? p.name.trim().toLowerCase() : p.id);
    }

    const seen = new Set<string>();
    const result: Appointment[] = [];

    for (const appt of appointments) {
      const pName = patientNameMap.get(appt.patientId) || appt.patientId;
      // Normaliza para 'YYYY-MM-DDTHH:mm' (cortando segundos/milissegundos)
      const timeKey = appt.startTime ? appt.startTime.substring(0, 16) : '';
      const key = `${pName}__${timeKey}`;

      if (!seen.has(key)) {
        seen.add(key);
        result.push(appt);
      }
    }
    return result;
  }, [appointments, patients]);

  // =========================================================================
  // LIMPEZA DE DUPLICADOS NO FIRESTORE & SEEDING DETERMINÍSTICO (Anti-Duplicação)
  // =========================================================================

  // Exclui fisicamente do Firestore os documentos duplicados existentes
  const cleanDuplicatesFromFirestore = async () => {
    if (!user) return;
    setIsSeeding(true);
    try {
      const patientNameMap = new Map<string, string>();
      for (const p of patients) {
        patientNameMap.set(p.id, p.name ? p.name.trim().toLowerCase() : p.id);
      }

      const seen = new Set<string>();
      let removedCount = 0;

      for (const appt of appointments) {
        const pName = patientNameMap.get(appt.patientId) || appt.patientId;
        const timeKey = appt.startTime ? appt.startTime.substring(0, 16) : '';
        const key = `${pName}__${timeKey}`;

        if (seen.has(key)) {
          // Documento duplicado encontrado no banco de dados!
          try {
            await deleteDoc(doc(db, 'appointments', appt.id));
            removedCount++;
          } catch (delErr) {
            console.warn('Erro ao deletar documento duplicado:', delErr);
          }
        } else {
          seen.add(key);
        }
      }

      alert(`Limpeza concluída! ${removedCount} consultas duplicadas foram removidas permanentemente.`);
    } catch (error) {
      console.error('Error cleaning duplicates:', error);
      alert('Erro ao limpar duplicados: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsSeeding(false);
    }
  };

  // Seed com IDs Determinísticos (Usando setDoc em vez de addDoc para NUNCA duplicar)
  const seedDatabase = async () => {
    if (!user) return;
    setIsSeeding(true);
    try {
      // 1. Seed Patients usando IDs determinísticos (mock_patient_1, mock_patient_2, ...)
      const patientIds: string[] = [];
      let pIdx = 0;
      for (const p of INITIAL_REALISTIC_PATIENTS) {
        pIdx++;
        const pDocId = `mock_p_${pIdx}`;
        await setDoc(doc(db, 'patients', pDocId), p);
        patientIds.push(pDocId);
      }

      // 2. Seed Materials usando IDs determinísticos (mock_m_1, mock_m_2, ...)
      const createdMaterials: { id: string; currentStock: number; averageConsumption: number }[] = [];
      let mIdx = 0;
      for (const m of INITIAL_REALISTIC_MATERIALS) {
        mIdx++;
        const mDocId = `mock_m_${mIdx}`;
        await setDoc(doc(db, 'materials', mDocId), m);
        createdMaterials.push({ id: mDocId, currentStock: m.currentStock, averageConsumption: m.averageConsumption });
      }

      // 3. Seed Realistic Inventory Movement Logs usando IDs determinísticos
      const logs = generateRealisticInventoryLogs(createdMaterials, user.uid);
      let lIdx = 0;
      for (const log of logs) {
        lIdx++;
        await setDoc(doc(db, 'inventoryLogs', `mock_log_${log.materialId}_${lIdx}`), log);
      }

      // 4. Seed Appointments usando IDs determinísticos (mock_appt_...)
      const mockAppointments = generateRealisticAppointments(patientIds, user.uid);
      let aIdx = 0;
      for (const appt of mockAppointments) {
        aIdx++;
        await setDoc(doc(db, 'appointments', `mock_appt_${appt.patientId}_${aIdx}`), appt);
      }

      // 5. Limpa automaticamente quaisquer resquícios duplicados antigos
      const patientNameMap = new Map<string, string>();
      for (const p of patients) {
        patientNameMap.set(p.id, p.name ? p.name.trim().toLowerCase() : p.id);
      }

      const seen = new Set<string>();
      for (const appt of appointments) {
        const pName = patientNameMap.get(appt.patientId) || appt.patientId;
        const timeKey = appt.startTime ? appt.startTime.substring(0, 16) : '';
        const key = `${pName}__${timeKey}`;

        if (seen.has(key)) {
          try {
            await deleteDoc(doc(db, 'appointments', appt.id));
          } catch (e) {
            // Ignora se não puder deletar
          }
        } else {
          seen.add(key);
        }
      }

      alert('Base populada com sucesso! IDs determinísticos aplicados para garantir que não haja duplicatas.');
    } catch (error) {
      console.error('Error seeding database:', error);
      alert('Erro ao popular banco de dados.');
    } finally {
      setIsSeeding(false);
    }
  };

  // Auth Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const isAdminEmail = firebaseUser.email?.toLowerCase() === 'caiohenrique270@gmail.com';
          if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            if (isAdminEmail && data.role !== 'admin') {
              const updatedProfile = { ...data, role: 'admin' as const };
              await updateDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin' });
              setProfile(updatedProfile);
            } else {
              setProfile(data);
            }
          } else {
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'Dentista',
              role: isAdminEmail ? 'admin' : 'dentist'
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          console.error('Error fetching profile:', error);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Real-time Data Listeners
  useEffect(() => {
    if (!user) return;

    const unsubPatients = onSnapshot(collection(db, 'patients'), (snapshot) => {
      setPatients(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Patient)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'patients'));

    const unsubAppointments = onSnapshot(collection(db, 'appointments'), (snapshot) => {
      setAppointments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Appointment)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'appointments'));

    const unsubMaterials = onSnapshot(collection(db, 'materials'), (snapshot) => {
      setMaterials(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Material)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'materials'));

    const unsubLogs = onSnapshot(collection(db, 'inventoryLogs'), (snapshot) => {
      setInventoryLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InventoryLog)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'inventoryLogs'));

    return () => {
      unsubPatients();
      unsubAppointments();
      unsubMaterials();
      unsubLogs();
    };
  }, [user]);

  const handleLogin = async () => {
    setAuthError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
      setAuthError('Erro ao entrar com Google.');
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error('Email auth error:', error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setAuthError('Usuário ou senha incorretos.');
      } else if (error.code === 'auth/email-already-in-use') {
        setAuthError('Este e-mail já está em uso.');
      } else if (error.code === 'auth/weak-password') {
        setAuthError('A senha deve ter pelo menos 6 caracteres.');
      } else if (error.code === 'auth/operation-not-allowed') {
        setAuthError('O login por e-mail e senha não está ativado no Console do Firebase.');
      } else {
        setAuthError('Ocorreu um erro: ' + (error.message || 'Tente novamente.'));
      }
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full p-6 sm:p-8 space-y-5">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <TrendingUp size={28} />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">OdontoVision</h1>
            <p className="text-xs sm:text-sm text-gray-600">{isRegistering ? 'Crie sua conta para começar' : 'Acesse sua clínica de forma segura'}</p>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-3.5">
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">E-mail</label>
              <Input 
                type="email" 
                placeholder="dentista@odontovision.com" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Senha</label>
              <Input 
                type="password" 
                placeholder="••••••••" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            {authError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-600 text-center">{authError}</p>
              </div>
            )}
            <Button type="submit" className="w-full py-3">
              {isRegistering ? 'Criar Conta' : 'Entrar no Sistema'}
            </Button>
          </form>

          <div className="text-center">
            <button 
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-xs sm:text-sm text-blue-600 hover:underline cursor-pointer py-1"
            >
              {isRegistering ? 'Já tem uma conta? Entre aqui' : 'Não tem conta? Cadastre-se'}
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white text-gray-400">Recomendado</span>
            </div>
          </div>

          <div className="space-y-2.5">
            <Button onClick={handleLogin} variant="secondary" className="w-full py-3 border border-gray-300">
              <img src="https://www.gstatic.com/firebase/zero-state/google-social-login.svg" alt="Google" className="w-5 h-5 mr-2" />
              Entrar com Google
            </Button>
            <p className="text-[10px] text-gray-400 text-center">
              Dica: O login via Google funciona instantaneamente com sua conta autenticada.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const isCaioAdmin = user.email?.toLowerCase() === 'caiohenrique270@gmail.com' || profile?.role === 'admin';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
      {/* Mobile Backdrop Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 lg:hidden backdrop-blur-xs transition-opacity" 
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}

      {/* Sidebar (Desktop and Mobile Drawer) */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-200 transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:w-64 flex flex-col",
        isSidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-5 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center">
              <TrendingUp size={18} />
            </div>
            <span className="font-bold text-lg text-gray-900">OdontoVision</span>
          </div>
          <button 
            className="lg:hidden p-2 text-gray-500 hover:text-gray-800 cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center" 
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-3.5 space-y-1 overflow-y-auto">
          <SidebarItem 
            icon={<LayoutDashboard size={19} />} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<Brain size={19} className="text-purple-600" />} 
            label="Inteligência ML" 
            active={activeTab === 'ml'} 
            onClick={() => { setActiveTab('ml'); setIsSidebarOpen(false); }} 
            badge="IA"
          />
          <SidebarItem 
            icon={<Calendar size={19} />} 
            label="Agenda" 
            active={activeTab === 'agenda'} 
            onClick={() => { setActiveTab('agenda'); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<Package size={19} />} 
            label="Estoque" 
            active={activeTab === 'inventory'} 
            onClick={() => { setActiveTab('inventory'); setIsSidebarOpen(false); }} 
          />
          <SidebarItem 
            icon={<Users size={19} />} 
            label="Pacientes" 
            active={activeTab === 'patients'} 
            onClick={() => { setActiveTab('patients'); setIsSidebarOpen(false); }} 
          />
        </nav>

        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3 mb-3">
            <img 
              src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'Dentista')}`} 
              alt="Avatar" 
              className="w-9 h-9 rounded-full border border-gray-200"
              referrerPolicy="no-referrer"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-900 truncate">{user.displayName || user.email}</p>
              <p className="text-[10px] text-gray-500 truncate capitalize">
                {isCaioAdmin ? 'Administrador' : (profile?.role === 'staff' ? 'Equipe' : 'Dentista')}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-red-600 hover:bg-red-50" onClick={handleLogout}>
            <LogOut size={16} />
            Sair da Conta
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Sticky Mobile/Desktop Header */}
        <header className="h-14 sm:h-16 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button 
              className="lg:hidden p-2 -ml-1 text-gray-600 hover:text-gray-900 cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center" 
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Abrir Menu"
            >
              <Menu size={22} />
            </button>
            <h2 className="text-sm sm:text-base font-bold text-gray-900 truncate">
              {activeTab === 'dashboard' ? 'Painel de Controle' : 
               activeTab === 'agenda' ? 'Agenda de Consultas' : 
               activeTab === 'inventory' ? 'Controle de Estoque' : 
               activeTab === 'patients' ? 'Gestão de Pacientes' : 'Modelos de Machine Learning'}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3">
            <button
              onClick={() => setActiveTab('ml')}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer min-h-[36px]",
                activeTab === 'ml' 
                  ? "bg-purple-600 text-white" 
                  : "bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200"
              )}
            >
              <Brain size={14} className={activeTab === 'ml' ? 'text-white' : 'text-purple-600'} />
              <span className="hidden sm:inline">Modelos ML</span>
              <span className="sm:hidden font-bold">ML</span>
            </button>
          </div>
        </header>

        {/* Dynamic Page Content with bottom padding for mobile navigation bar */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 pb-24 lg:pb-8">
          {activeTab === 'dashboard' && (
            <DashboardView 
              appointments={uniqueAppointments} 
              materials={uniqueMaterials} 
              inventoryLogs={inventoryLogs} 
              patients={uniquePatients}
              onNavigateToML={() => setActiveTab('ml')}
            />
          )}
          {activeTab === 'ml' && (
            <MachineLearningView 
              materials={uniqueMaterials}
              inventoryLogs={inventoryLogs}
              appointments={uniqueAppointments}
              patients={uniquePatients}
            />
          )}
          {activeTab === 'agenda' && (
            <AgendaView 
              appointments={uniqueAppointments} 
              patients={uniquePatients} 
              onNavigateToML={() => setActiveTab('ml')}
            />
          )}
          {activeTab === 'inventory' && (
            <InventoryView 
              materials={uniqueMaterials} 
              logs={inventoryLogs} 
              userId={user.uid} 
              onNavigateToML={() => setActiveTab('ml')}
            />
          )}
          {activeTab === 'patients' && (
            <PatientsView 
              patients={uniquePatients} 
              appointments={uniqueAppointments} 
            />
          )}
        </div>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 lg:hidden flex items-center justify-around py-1 px-1 shadow-lg">
          <button
            onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 min-h-[48px] rounded-lg transition-colors cursor-pointer",
              activeTab === 'dashboard' ? "text-blue-600 font-bold" : "text-gray-500 hover:text-gray-900"
            )}
          >
            <LayoutDashboard size={18} />
            <span className="text-[10px] mt-0.5">Início</span>
          </button>

          <button
            onClick={() => { setActiveTab('ml'); setIsSidebarOpen(false); }}
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 min-h-[48px] rounded-lg transition-colors cursor-pointer",
              activeTab === 'ml' ? "text-purple-600 font-bold" : "text-gray-500 hover:text-gray-900"
            )}
          >
            <Brain size={18} className={activeTab === 'ml' ? "text-purple-600" : ""} />
            <span className="text-[10px] mt-0.5">ML</span>
          </button>

          <button
            onClick={() => { setActiveTab('agenda'); setIsSidebarOpen(false); }}
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 min-h-[48px] rounded-lg transition-colors cursor-pointer",
              activeTab === 'agenda' ? "text-blue-600 font-bold" : "text-gray-500 hover:text-gray-900"
            )}
          >
            <Calendar size={18} />
            <span className="text-[10px] mt-0.5">Agenda</span>
          </button>

          <button
            onClick={() => { setActiveTab('inventory'); setIsSidebarOpen(false); }}
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 min-h-[48px] rounded-lg transition-colors cursor-pointer",
              activeTab === 'inventory' ? "text-blue-600 font-bold" : "text-gray-500 hover:text-gray-900"
            )}
          >
            <Package size={18} />
            <span className="text-[10px] mt-0.5">Estoque</span>
          </button>

          <button
            onClick={() => { setActiveTab('patients'); setIsSidebarOpen(false); }}
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 min-h-[48px] rounded-lg transition-colors cursor-pointer",
              activeTab === 'patients' ? "text-blue-600 font-bold" : "text-gray-500 hover:text-gray-900"
            )}
          >
            <Users size={18} />
            <span className="text-[10px] mt-0.5">Pacientes</span>
          </button>
        </nav>
      </main>
    </div>
  );
}

function SidebarItem({ 
  icon, 
  label, 
  active, 
  badge, 
  onClick 
}: { 
  icon: React.ReactNode; 
  label: string; 
  active?: boolean; 
  badge?: string; 
  onClick: () => void 
}) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-sm font-medium cursor-pointer min-h-[44px]",
        active ? "bg-blue-50 text-blue-600 font-semibold" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      )}
    >
      <div className="flex items-center gap-3">
        {icon}
        {label}
      </div>
      {badge && (
        <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full uppercase">
          {badge}
        </span>
      )}
    </button>
  );
}

// --- Views ---

function DashboardView({ 
  appointments, 
  materials, 
  inventoryLogs, 
  patients,
  onNavigateToML
}: { 
  appointments: Appointment[]; 
  materials: Material[]; 
  inventoryLogs: InventoryLog[]; 
  patients: Patient[];
  onNavigateToML: () => void;
  onSeed?: () => void; 
  isSeeding?: boolean; 
  isAdmin?: boolean; 
  onCleanDuplicates?: () => void;
}) {
  const stats = useMemo(() => {
    const total = appointments.length;
    const completed = appointments.filter(a => a.status === 'completed').length;
    const cancelled = appointments.filter(a => a.status === 'cancelled').length;
    const scheduled = appointments.filter(a => a.status === 'scheduled').length;
    
    const lowStock = materials.filter(m => m.currentStock <= m.minStock).length;
    
    const aprilDays = Array.from({ length: 30 }, (_, i) => {
      return (i + 1).toString().padStart(2, '0') + '/04';
    });

    const behaviorData = aprilDays.map(day => {
      const count = appointments.filter(a => format(parseISO(a.startTime), 'dd/MM') === day).length;
      return { name: day, agendamentos: count };
    });

    const consumptionData = materials.slice(0, 5).map(m => ({
      name: m.name.substring(0, 10),
      consumo: inventoryLogs.filter(l => l.materialId === m.id && l.type === 'consumption').reduce((acc, curr) => acc + curr.quantity, 0)
    }));

    const stockML = materials.map(m => ({
      material: m,
      analysis: analyzeStockWithLinearRegression(m, inventoryLogs)
    }));
    const urgentReorders = stockML
      .filter(s => s.analysis.status === 'critical' || s.analysis.status === 'warning')
      .sort((a, b) => a.analysis.daysUntilMinStock - b.analysis.daysUntilMinStock);

    const scheduledAppts = appointments.filter(a => a.status === 'scheduled');
    const predictions = scheduledAppts.map(a => 
      predictAppointmentAttendance(a, patients.find(p => p.id === a.patientId), appointments)
    );
    const avgAttendanceProb = predictions.length > 0 
      ? Math.round(predictions.reduce((acc, p) => acc + p.attendanceProbability, 0) / predictions.length)
      : 80;
    const highRiskCount = predictions.filter(p => p.riskLevel === 'high').length;

    return { 
      total, 
      completed, 
      cancelled, 
      scheduled, 
      lowStock, 
      behaviorData, 
      consumptionData,
      urgentReorders,
      avgAttendanceProb,
      highRiskCount
    };
  }, [appointments, materials, inventoryLogs, patients]);

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* KPI Cards Principais - 2x2 no mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <KpiCard title="Total Consultas" value={stats.total} icon={<Calendar className="text-blue-600" size={18} />} color="blue" />
        <KpiCard title="Concluídas" value={stats.completed} icon={<CheckCircle2 className="text-green-600" size={18} />} color="green" />
        <KpiCard title="Canceladas" value={stats.cancelled} icon={<Clock className="text-red-600" size={18} />} color="red" />
        <KpiCard title="Estoque Baixo" value={stats.lowStock} icon={<AlertTriangle className="text-orange-600" size={18} />} color="orange" />
      </div>

      {/* CARD DE MACHINE LEARNING NO DASHBOARD */}
      <Card className="p-4 sm:p-6 border-purple-200 bg-gradient-to-br from-white via-purple-50/20 to-indigo-50/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-purple-100">
          <div>
            <span className="bg-purple-100 text-purple-700 text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1">
              <Brain size={12} />
              Inteligência Preditiva Integrada
            </span>
            <h3 className="text-base sm:text-lg font-bold text-gray-900 mt-1">Previsões por Machine Learning</h3>
          </div>
          <Button 
            onClick={onNavigateToML}
            size="sm"
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 w-full sm:w-auto"
          >
            Abrir Módulo de ML &rarr;
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6 mt-3 sm:mt-4">
          {/* Previsão de Estoque */}
          <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Package size={15} className="text-blue-600" />
                Estoque: Recompra (Regressão Linear)
              </h4>
              <span className="text-xs text-blue-600 font-semibold cursor-pointer hover:underline" onClick={onNavigateToML}>
                Ver todos
              </span>
            </div>
            {stats.urgentReorders.length === 0 ? (
              <p className="text-xs text-gray-500 italic">Estoque saudável para todos os insumos.</p>
            ) : (
              <div className="space-y-2">
                {stats.urgentReorders.slice(0, 3).map(({ material, analysis }) => (
                  <div key={material.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 text-xs gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 truncate">{material.name}</p>
                      <p className="text-[10px] text-gray-500 truncate">
                        Consumo: {analysis.dailyConsumption.toFixed(2)}/dia | Duração: {analysis.daysUntilDepletion}d
                      </p>
                    </div>
                    <span className={cn("px-2 py-0.5 rounded-full font-bold text-[10px] border shrink-0", analysis.statusColor)}>
                      {analysis.daysUntilMinStock <= 0 ? 'Comprar Hoje' : `em ${analysis.daysUntilMinStock}d`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Previsão de Comparecimento da Agenda */}
          <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Calendar size={15} className="text-purple-600" />
                Agenda: Comparecimento & No-Show
              </h4>
              <span className="text-xs text-purple-600 font-semibold cursor-pointer hover:underline" onClick={onNavigateToML}>
                Ver todos
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 sm:p-3 bg-purple-50/50 rounded-lg border border-purple-100">
              <div>
                <p className="text-[10px] sm:text-xs text-purple-900 font-semibold">Presença Geral Prevista</p>
                <p className="text-xl sm:text-2xl font-black text-purple-700">{stats.avgAttendanceProb}%</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] sm:text-xs text-gray-600 font-semibold">Alertas No-Show (&lt;60%)</p>
                <p className="text-xl sm:text-2xl font-black text-red-600">{stats.highRiskCount}</p>
              </div>
            </div>
            <p className="text-[10px] text-gray-500">
              Inferência Bayesiana atualizada automaticamente com base no histórico do paciente.
            </p>
          </div>
        </div>
      </Card>

      {/* Gráficos de Agendamentos e Insumos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card className="p-4 sm:p-6">
          <h3 className="text-sm sm:text-base font-semibold mb-3 sm:mb-4 flex items-center gap-1.5">
            <TrendingUp size={18} className="text-blue-600" />
            Comportamento de Agendamentos (Abril)
          </h3>
          <div className="h-60 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.behaviorData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="agendamentos" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <h3 className="text-sm sm:text-base font-semibold mb-3 sm:mb-4 flex items-center gap-1.5">
            <Package size={18} className="text-blue-600" />
            Consumo de Insumos (Top 5)
          </h3>
          <div className="h-60 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.consumptionData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="consumo" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Alertas */}
      {stats.lowStock > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3.5 flex items-start gap-2.5">
          <AlertTriangle className="text-orange-600 shrink-0 mt-0.5" size={18} />
          <div>
            <h4 className="font-semibold text-xs sm:text-sm text-orange-900">Alerta de Estoque Mínimo</h4>
            <p className="text-xs text-orange-700 mt-0.5">
              Existem {stats.lowStock} materiais abaixo do estoque mínimo. A Regressão Linear calculou o ponto ideal de reposição na aba Estoque.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ 
  title, 
  value, 
  icon, 
  color 
}: { 
  title: string; 
  value: number; 
  icon: React.ReactNode; 
  color: 'blue' | 'green' | 'red' | 'orange' 
}) {
  const bgColors = {
    blue: 'bg-blue-50',
    green: 'bg-green-50',
    red: 'bg-red-50',
    orange: 'bg-orange-50',
  };
  return (
    <Card className="p-3.5 sm:p-5">
      <div className="flex items-center justify-between mb-2">
        <div className={cn('w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center', bgColors[color])}>
          {icon}
        </div>
      </div>
      <p className="text-[11px] sm:text-xs text-gray-500 font-medium truncate">{title}</p>
      <h4 className="text-xl sm:text-2xl font-bold text-gray-900 mt-0.5">{value}</h4>
    </Card>
  );
}

function AgendaView({ 
  appointments, 
  patients, 
  onNavigateToML 
}: { 
  appointments: Appointment[]; 
  patients: Patient[]; 
  onNavigateToML?: () => void;
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [selectedPredictionAppt, setSelectedPredictionAppt] = useState<Appointment | null>(null);
  const [newAppointment, setNewAppointment] = useState<Partial<Appointment>>({
    status: 'scheduled',
    startTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    endTime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarDays = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(monthEnd) });

  const handleAddAppointment = async () => {
    if (!newAppointment.patientId || !newAppointment.startTime || !newAppointment.endTime) return;
    try {
      await addDoc(collection(db, 'appointments'), {
        ...newAppointment,
        dentistId: auth.currentUser?.uid,
      });
      setShowModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'appointments');
    }
  };

  const handleDeleteAppointment = async (apptId: string) => {
    if (confirm('Deseja cancelar e remover esta consulta da agenda?')) {
      try {
        await deleteDoc(doc(db, 'appointments', apptId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'appointments');
      }
    }
  };

  // Consultas do dia selecionado com garantia de não duplicação
  const dayAppointments = useMemo(() => {
    const list = appointments.filter(a => isSameDay(parseISO(a.startTime), currentDate));
    
    // Deduplica rigorosamente por Paciente + Horário (HH:mm)
    const seen = new Set<string>();
    const unique: Appointment[] = [];
    
    for (const appt of list) {
      const p = patients.find(pat => pat.id === appt.patientId);
      const nameKey = p ? p.name.trim().toLowerCase() : appt.patientId;
      const timeKey = appt.startTime ? appt.startTime.substring(0, 16) : '';
      const key = `${nameKey}__${timeKey}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(appt);
      }
    }
    return unique;
  }, [appointments, currentDate, patients]);

  const selectedApptPrediction = useMemo(() => {
    if (!selectedPredictionAppt) return null;
    const patient = patients.find(p => p.id === selectedPredictionAppt.patientId);
    return predictAppointmentAttendance(selectedPredictionAppt, patient, appointments);
  }, [selectedPredictionAppt, patients, appointments]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      <div className="lg:col-span-2 space-y-4 sm:space-y-6">
        <Card className="p-3.5 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-6">
            <h3 className="text-sm sm:text-lg font-bold text-gray-900 capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
            </h3>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Button variant="secondary" size="sm" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                <ChevronLeft size={16} />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                <ChevronRight size={16} />
              </Button>
              <Button size="sm" onClick={() => setShowModal(true)}>
                <Plus size={16} />
                <span className="hidden sm:inline">Novo</span>
              </Button>
            </div>
          </div>

          {/* Calendário Responsivo */}
          <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
              <div key={day} className="bg-gray-50 p-1 sm:p-2 text-center text-[10px] sm:text-xs font-bold text-gray-500 uppercase">
                {day}
              </div>
            ))}
            {calendarDays.map((day, i) => {
              const hasAppts = appointments.some(a => isSameDay(parseISO(a.startTime), day));
              const isToday = isSameDay(day, new Date());
              const isSelected = isSameDay(day, currentDate);
              
              return (
                <button 
                  key={i} 
                  onClick={() => setCurrentDate(day)}
                  className={cn(
                    "bg-white p-1 sm:p-3 h-14 sm:h-20 text-left transition-colors hover:bg-gray-50 relative cursor-pointer",
                    !isSameDay(day, monthStart) && day < monthStart && "text-gray-300",
                    day > monthEnd && "text-gray-300",
                    isSelected && "bg-blue-50 ring-2 ring-blue-500 ring-inset z-10"
                  )}
                >
                  <span className={cn(
                    "text-xs sm:text-sm font-medium",
                    isToday && "bg-blue-600 text-white w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full text-[10px] sm:text-xs"
                  )}>
                    {format(day, 'd')}
                  </span>
                  {hasAppts && (
                    <div className="mt-1 flex gap-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="space-y-4 sm:space-y-6">
        <Card className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm sm:text-base font-bold text-gray-900">
              Consultas do Dia ({format(currentDate, 'dd/MM')})
            </h3>
            <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
              <Brain size={11} /> ML
            </span>
          </div>

          <div className="space-y-2.5">
            {dayAppointments.length === 0 ? (
              <p className="text-gray-500 text-xs italic py-4 text-center">Nenhuma consulta agendada para esta data.</p>
            ) : (
              dayAppointments.sort((a, b) => a.startTime.localeCompare(b.startTime)).map(appt => {
                const patient = patients.find(p => p.id === appt.patientId);
                const prediction = predictAppointmentAttendance(appt, patient, appointments);

                return (
                  <div key={appt.id} className="p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="text-center min-w-[45px] bg-gray-50 p-1.5 rounded-lg border border-gray-100 shrink-0">
                          <p className="text-xs font-bold text-gray-900">{format(parseISO(appt.startTime), 'HH:mm')}</p>
                          <p className="text-[9px] text-gray-400 uppercase">Horário</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-gray-900 truncate">{patient?.name || 'Paciente'}</p>
                          <p className="text-[11px] text-gray-500 truncate">{appt.notes || 'Consulta'}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                            appt.status === 'scheduled' ? 'bg-blue-100 text-blue-700' : 
                            appt.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          )}>
                            {appt.status === 'scheduled' ? 'Agendado' : appt.status === 'completed' ? 'Concluído' : 'Cancelado'}
                          </span>
                          <button
                            onClick={() => handleDeleteAppointment(appt.id)}
                            className="text-gray-400 hover:text-red-600 p-0.5 transition-colors cursor-pointer"
                            title="Excluir agendamento"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>

                        {appt.status === 'scheduled' && (
                          <button
                            onClick={() => setSelectedPredictionAppt(appt)}
                            className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] font-bold border flex items-center gap-1 cursor-pointer",
                              prediction.riskBadgeClass
                            )}
                          >
                            <Brain size={10} />
                            {prediction.attendanceProbability}%
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Modal de Detalhes da Predição */}
      {selectedPredictionAppt && selectedApptPrediction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-md p-4 sm:p-6 space-y-3.5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-gray-100 pb-2.5">
              <div>
                <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                  Predição de Comparecimento
                </span>
                <h3 className="text-base font-bold text-gray-900 mt-1">{selectedApptPrediction.patientName}</h3>
                <p className="text-xs text-gray-500">
                  {format(parseISO(selectedPredictionAppt.startTime), 'dd/MM/yyyy às HH:mm')}
                </p>
              </div>
              <button 
                onClick={() => setSelectedPredictionAppt(null)} 
                className="text-gray-400 hover:text-gray-600 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-semibold">Chance de Comparecer</p>
                <p className="text-2xl font-black text-gray-900">{selectedApptPrediction.attendanceProbability}%</p>
                <p className="text-[11px] text-gray-500">No-Show: <strong>{selectedApptPrediction.noShowProbability}%</strong></p>
              </div>
              <span className={cn("px-2.5 py-1 rounded-lg text-xs font-bold border", selectedApptPrediction.riskBadgeClass)}>
                {selectedApptPrediction.riskLabel}
              </span>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">Variável Bayesiana</h4>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-purple-50 p-2 rounded border border-purple-100">
                  <p className="text-[9px] text-purple-600 font-bold">Prior</p>
                  <p className="font-bold text-purple-900">{(selectedApptPrediction.bayes.priorMean * 100).toFixed(0)}%</p>
                </div>
                <div className="bg-gray-50 p-2 rounded border border-gray-200">
                  <p className="text-[9px] text-gray-600 font-bold">Histórico</p>
                  <p className="font-bold text-gray-900">{selectedApptPrediction.bayes.pastAttended}/{selectedApptPrediction.bayes.pastTotal}</p>
                </div>
                <div className="bg-indigo-50 p-2 rounded border border-indigo-100">
                  <p className="text-[9px] text-indigo-600 font-bold">Posterior</p>
                  <p className="font-bold text-indigo-900">{(selectedApptPrediction.bayes.posteriorMean * 100).toFixed(0)}%</p>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">Ações Preventivas</h4>
              {selectedApptPrediction.recommendations.map((rec, i) => (
                <p key={i} className="text-xs text-amber-900 bg-amber-50 p-2 rounded border border-amber-200">
                  {rec}
                </p>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              {onNavigateToML && (
                <Button 
                  variant="secondary" 
                  size="sm"
                  className="flex-1" 
                  onClick={() => {
                    setSelectedPredictionAppt(null);
                    onNavigateToML();
                  }}
                >
                  Abrir Simulador
                </Button>
              )}
              <Button size="sm" className="flex-1" onClick={() => setSelectedPredictionAppt(null)}>Fechar</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Modal Novo Agendamento */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold">Novo Agendamento</h3>
            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Paciente</label>
                <Select 
                  value={newAppointment.patientId || ''} 
                  onChange={e => setNewAppointment({ ...newAppointment, patientId: e.target.value })}
                >
                  <option value="">Selecione um paciente</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Início</label>
                  <Input 
                    type="datetime-local" 
                    value={newAppointment.startTime} 
                    onChange={e => setNewAppointment({ ...newAppointment, startTime: e.target.value })} 
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Fim</label>
                  <Input 
                    type="datetime-local" 
                    value={newAppointment.endTime} 
                    onChange={e => setNewAppointment({ ...newAppointment, endTime: e.target.value })} 
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Procedimento / Observações</label>
                <textarea 
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none text-sm" 
                  rows={2}
                  value={newAppointment.notes || ''}
                  onChange={e => setNewAppointment({ ...newAppointment, notes: e.target.value })}
                  placeholder="Ex: Restauração, Profilaxia, Canal..."
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleAddAppointment}>Agendar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function InventoryView({ 
  materials, 
  logs, 
  userId, 
  onNavigateToML 
}: { 
  materials: Material[]; 
  logs: InventoryLog[]; 
  userId: string; 
  onNavigateToML?: () => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [newMaterial, setNewMaterial] = useState<Partial<Material>>({
    currentStock: 0,
    minStock: 5,
    averageConsumption: 0
  });

  const handleAddMaterial = async () => {
    if (!newMaterial.name || !newMaterial.unit) return;
    try {
      await addDoc(collection(db, 'materials'), newMaterial);
      setShowModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'materials');
    }
  };

  const handleUpdateStock = async (material: Material, amount: number, type: 'consumption' | 'addition') => {
    const newStock = type === 'consumption' ? material.currentStock - amount : material.currentStock + amount;
    if (newStock < 0) return;

    try {
      await updateDoc(doc(db, 'materials', material.id), { currentStock: newStock });
      await addDoc(collection(db, 'inventoryLogs'), {
        materialId: material.id,
        quantity: amount,
        type,
        date: new Date().toISOString(),
        userId
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'materials');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">Materiais & Insumos</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Monitoramento de estoque com projeção de consumo diário por Regressão Linear.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onNavigateToML && (
            <Button variant="secondary" size="sm" onClick={onNavigateToML}>
              <Brain size={14} className="text-purple-600" />
              <span className="hidden sm:inline">Análise OLS</span>
              <span className="sm:hidden">ML</span>
            </Button>
          )}
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Plus size={16} />
            <span>Novo</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
        {materials.map(material => {
          const isLow = material.currentStock <= material.minStock;
          const analysis = analyzeStockWithLinearRegression(material, logs);

          return (
            <Card key={material.id} className={cn("p-4 sm:p-5 border-l-4", isLow ? "border-l-red-500" : "border-l-blue-500")}>
              <div className="flex justify-between items-start mb-2.5">
                <div className="min-w-0 pr-2">
                  <h4 className="font-bold text-sm sm:text-base text-gray-900 truncate">{material.name}</h4>
                  <p className="text-[11px] text-gray-500 truncate">{material.unit}</p>
                </div>
                {isLow ? (
                  <div className="bg-red-100 text-red-700 p-1 rounded-lg shrink-0" title="Estoque Baixo">
                    <AlertTriangle size={16} />
                  </div>
                ) : (
                  <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0", analysis.statusColor)}>
                    {analysis.statusLabel}
                  </span>
                )}
              </div>

              {/* Saldo de Estoque */}
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-bold">Estoque Atual</p>
                  <p className={cn("text-2xl sm:text-3xl font-bold", isLow ? "text-red-600" : "text-gray-900")}>
                    {material.currentStock}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 uppercase font-bold">Mínimo</p>
                  <p className="text-sm sm:text-base font-semibold text-gray-700">{material.minStock}</p>
                </div>
              </div>

              {/* Card de Previsão de ML (Regressão Linear) */}
              <div className="mb-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 text-[11px] flex items-center gap-1">
                    <TrendingDown size={12} className="text-blue-600" />
                    Regressão Linear OLS
                  </span>
                  <span className="font-mono text-[10px] text-gray-400">
                    R² {(analysis.rSquared * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-slate-600 pt-0.5">
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase block">Consumo</span>
                    <strong className="text-slate-800 text-[11px]">{analysis.dailyConsumption.toFixed(2)}/dia</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase block">Duração</span>
                    <strong className="text-slate-800 text-[11px]">{analysis.daysUntilDepletion} dias</strong>
                  </div>
                </div>
                <p className="text-slate-600 text-[10px] pt-1 border-t border-slate-200/60 truncate">
                  Recompra: <strong>{analysis.daysUntilMinStock <= 0 ? 'Imediato' : `em ${analysis.daysUntilMinStock}d (${analysis.reorderDate})`}</strong>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" size="sm" onClick={() => handleUpdateStock(material, 1, 'consumption')}>
                  -1 Consumo
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handleUpdateStock(material, 1, 'addition')}>
                  +1 Adição
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md p-4 sm:p-6 space-y-3.5 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold">Cadastrar Material</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Nome do Material</label>
                <Input value={newMaterial.name || ''} onChange={e => setNewMaterial({ ...newMaterial, name: e.target.value })} placeholder="Ex: Luvas de Látex" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Unidade</label>
                <Input value={newMaterial.unit || ''} onChange={e => setNewMaterial({ ...newMaterial, unit: e.target.value })} placeholder="Ex: Caixa com 100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Estoque Inicial</label>
                  <Input type="number" value={newMaterial.currentStock} onChange={e => setNewMaterial({ ...newMaterial, currentStock: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Estoque Mínimo</label>
                  <Input type="number" value={newMaterial.minStock} onChange={e => setNewMaterial({ ...newMaterial, minStock: Number(e.target.value) })} />
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleAddMaterial}>Cadastrar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function PatientsView({ patients, appointments }: { patients: Patient[], appointments: Appointment[] }) {
  const [showModal, setShowModal] = useState(false);
  const [newPatient, setNewPatient] = useState<Partial<Patient>>({});

  const handleAddPatient = async () => {
    if (!newPatient.name) return;
    try {
      await addDoc(collection(db, 'patients'), newPatient);
      setShowModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'patients');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900">Pacientes</h3>
          <p className="text-xs text-gray-500 mt-0.5">{patients.length} pacientes cadastrados</p>
        </div>
        <Button size="sm" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          <span>Novo</span>
        </Button>
      </div>

      <Card>
        {/* Mobile View: Cards list (No cramped horizontal scrolling) */}
        <div className="md:hidden divide-y divide-gray-100">
          {patients.map(patient => {
            const patientAppts = appointments.filter(a => a.patientId === patient.id);
            const completedCount = patientAppts.filter(a => a.status === 'completed').length;
            const cancelledCount = patientAppts.filter(a => a.status === 'cancelled').length;
            const lastAppt = patientAppts
              .filter(a => a.status === 'completed')
              .sort((a, b) => b.startTime.localeCompare(a.startTime))[0];

            return (
              <div key={patient.id} className="p-3.5 space-y-2 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-gray-900 text-sm">{patient.name}</h4>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-green-700 bg-green-50 px-1.5 py-0.5 rounded font-semibold">
                      {completedCount} presenças
                    </span>
                    {cancelledCount > 0 && (
                      <span className="text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-semibold">
                        {cancelledCount} faltas
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  {patient.phone && (
                    <span className="flex items-center gap-1">
                      <Phone size={11} className="text-gray-400" />
                      {patient.phone}
                    </span>
                  )}
                  {patient.email && (
                    <span className="flex items-center gap-1 truncate max-w-[180px]">
                      <Mail size={11} className="text-gray-400" />
                      {patient.email}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-gray-400">
                  Última consulta: {lastAppt ? format(parseISO(lastAppt.startTime), 'dd/MM/yyyy') : 'Nenhuma'}
                </p>
              </div>
            );
          })}
        </div>

        {/* Desktop View: Full Data Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase">
                <th className="px-6 py-3.5">Nome</th>
                <th className="px-6 py-3.5">Contato</th>
                <th className="px-6 py-3.5">Histórico</th>
                <th className="px-6 py-3.5">Última Consulta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {patients.map(patient => {
                const patientAppts = appointments.filter(a => a.patientId === patient.id);
                const completedCount = patientAppts.filter(a => a.status === 'completed').length;
                const cancelledCount = patientAppts.filter(a => a.status === 'cancelled').length;
                const lastAppt = patientAppts
                  .filter(a => a.status === 'completed')
                  .sort((a, b) => b.startTime.localeCompare(a.startTime))[0];

                return (
                  <tr key={patient.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-bold text-gray-900">{patient.name}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">{patient.phone || '-'}</p>
                      <p className="text-xs text-gray-400">{patient.email || '-'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded font-semibold">
                          {completedCount} presenças
                        </span>
                        {cancelledCount > 0 && (
                          <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded font-semibold">
                            {cancelledCount} faltas
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">
                        {lastAppt ? format(parseISO(lastAppt.startTime), 'dd/MM/yyyy') : 'Nenhuma'}
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md p-4 sm:p-6 space-y-3.5 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold">Cadastrar Paciente</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Nome Completo</label>
                <Input value={newPatient.name || ''} onChange={e => setNewPatient({ ...newPatient, name: e.target.value })} placeholder="Ex: João Silva" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Telefone</label>
                <Input value={newPatient.phone || ''} onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })} placeholder="(11) 99999-9999" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">E-mail</label>
                <Input type="email" value={newPatient.email || ''} onChange={e => setNewPatient({ ...newPatient, email: e.target.value })} placeholder="joao@email.com" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleAddPatient}>Cadastrar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
