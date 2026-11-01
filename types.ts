export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'dentist' | 'staff';
}

export interface Patient {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  dentistId: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
}

export interface Material {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
  averageConsumption: number;
}

export interface InventoryLog {
  id: string;
  materialId: string;
  quantity: number;
  type: 'consumption' | 'addition';
  date: string; // ISO string
  userId: string;
}
