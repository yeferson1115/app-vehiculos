import axios from 'axios';

import { API_URL, getAuthHeaders } from '@/services/auth';

interface IngresoMovil {
  id?: number | string;
  tiposervicio?: string | null;
  solicitante?: string | null;
  documento_solicitante?: string | null;
  placa?: string | null;
  movil?: string | null;
  marca?: string | null;
  linea?: string | null;
  modelo?: string | number | null;
  kilometraje?: string | number | null;
  fecha_inspeccion?: string | null;
}

export interface AvaluoMovil {
  id: number | string;
  tipo?: string | null;
  formato?: string | null;
  observaciones?: string | null;
  avaluador?: string | null;
  evaluador?: string | null;
  consecutivo?: string | number | null;
  updated_at?: string | null;
  created_at?: string | null;
  ingreso?: IngresoMovil | null;
}

interface AvaluosMovilResponse {
  data: AvaluoMovil[];
  current_page?: number;
  last_page?: number;
  per_page?: number;
  total?: number;
}

export interface AvaluosMovilParams {
  search?: string;
  tipo?: string;
  perPage?: number;
  page?: number;
}

export const getAvaluosMovil = async ({ search, tipo, perPage = 10, page = 1 }: AvaluosMovilParams = {}) => {
  const { data } = await axios.get<AvaluosMovilResponse>(`${API_URL}/avaluos/movil`, {
    headers: await getAuthHeaders(),
    params: {
      page,
      per_page: perPage,
      ...(search?.trim() ? { search: search.trim() } : {}),
      ...(tipo?.trim() ? { tipo: tipo.trim() } : {}),
    },
  });

  return data;
};
