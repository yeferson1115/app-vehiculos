import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';

import { getLoginErrorMessage, getSession, login, logout, subscribeToSessionExpired } from '@/services/auth';
import { AvaluoMovil, getAvaluosMovil } from '@/services/avaluos';
import {
  getPendingInspectionsCount,
  getStoredInspections,
  InspectionItem,
  syncPendingInspections,
} from '@/services/inspections';

export default function LoginScreen() {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [avaluos, setAvaluos] = useState<AvaluoMovil[]>([]);
  const [avaluosTotal, setAvaluosTotal] = useState(0);
  const [isLoadingAvaluos, setIsLoadingAvaluos] = useState(false);
  const [avaluosError, setAvaluosError] = useState('');
  const [localInspections, setLocalInspections] = useState<InspectionItem[]>([]);
  const [search, setSearch] = useState('');
  const [pendingInspections, setPendingInspections] = useState(0);
  const [isSyncingInspections, setIsSyncingInspections] = useState(false);


  const clearAuthenticatedState = useCallback(() => {
    setIsLoggedIn(false);
    setAvaluos([]);
    setAvaluosTotal(0);
    setPendingInspections(0);
    setLocalInspections([]);
  }, []);

  const loadLocalInspections = useCallback(async () => {
    const inspections = await getStoredInspections();
    setLocalInspections(inspections);
    setPendingInspections(inspections.filter((inspection) => inspection.syncStatus !== 'sent').length);
  }, []);

  const loadPendingInspections = useCallback(async () => {
    const pendingCount = await getPendingInspectionsCount();
    setPendingInspections(pendingCount);
    await loadLocalInspections();
  }, [loadLocalInspections]);

  const loadAvaluosMovil = useCallback(async (searchValue = '') => {
    setIsLoadingAvaluos(true);
    setAvaluosError('');

    try {
      const response = await getAvaluosMovil({ search: searchValue, perPage: 10 });
      setAvaluos(response.data);
      setAvaluosTotal(response.total ?? response.data.length);
    } catch {
      setAvaluosError('No fue posible cargar los avalúos trabajados desde el API.');
    } finally {
      setIsLoadingAvaluos(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToSessionExpired(() => {
      clearAuthenticatedState();
      setError('Tu sesión expiró. Inicia sesión nuevamente.');
      Alert.alert('Sesión expirada', 'Tu sesión expiró. Inicia sesión nuevamente.');
    });

    return unsubscribe;
  }, [clearAuthenticatedState]);

  useEffect(() => {
    const loadSession = async () => {
      const session = await getSession();
      if (session) {
        setIsLoggedIn(true);
        await loadAvaluosMovil('');
        await loadPendingInspections();
      }
    };

    void loadSession();
  }, [loadAvaluosMovil, loadPendingInspections]);

  const syncInspectionsSilently = useCallback(async () => {
    try {
      const result = await syncPendingInspections();
      setPendingInspections(result.pending.length);
      await loadLocalInspections();

      if (result.sent.length > 0) {
        await loadAvaluosMovil(search);
      }
    } catch {
      await loadLocalInspections();
    }
  }, [loadAvaluosMovil, loadLocalInspections, search]);

  useFocusEffect(
    useCallback(() => {
      if (isLoggedIn) {
        void loadAvaluosMovil(search);
        void loadLocalInspections();
        void syncInspectionsSilently();
      }
    }, [isLoggedIn, loadAvaluosMovil, loadLocalInspections, search, syncInspectionsSilently]),
  );

  useEffect(() => {
    if (!isLoggedIn) {
      return undefined;
    }

    const interval = setInterval(() => {
      void syncInspectionsSilently();
    }, 30000);

    return () => clearInterval(interval);
  }, [isLoggedIn, syncInspectionsSilently]);

  const handleLogin = async () => {
    if (!user.trim() || !password) {
      setError('Ingresa usuario y contraseña.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await login(user, password);
      setIsLoggedIn(true);
      await loadAvaluosMovil('');
      await loadPendingInspections();
    } catch (loginError) {
      setError(getLoginErrorMessage(loginError));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    await loadAvaluosMovil(search);
  };


  const handleSyncPendingInspections = async () => {
    setIsSyncingInspections(true);

    try {
      const result = await syncPendingInspections();
      setPendingInspections(result.pending.length);
      await loadLocalInspections();

      Alert.alert(
        'Sincronización de inspecciones',
        result.pending.length === 0
          ? `Se enviaron ${result.sent.length} inspecciones pendientes al servicio de Laravel.`
          : `Se enviaron ${result.sent.length}. Quedan ${result.pending.length} pendientes para intentar nuevamente cuando tengas conexión.`,
      );

      if (result.sent.length > 0) {
        await loadAvaluosMovil(search);
      }
    } finally {
      setIsSyncingInspections(false);
    }
  };


  const formatVehicle = (item: AvaluoMovil) => {
    const ingreso = item.ingreso;
    const details = [ingreso?.marca, ingreso?.linea, ingreso?.modelo].filter(Boolean).join(' ');

    return details || ingreso?.movil || 'Vehículo sin descripción';
  };

  const filteredLocalInspections = localInspections.filter((inspection) => {
    if (inspection.syncStatus === 'sent') {
      return false;
    }

    const value = search.trim().toLowerCase();

    if (!value) {
      return true;
    }

    return [inspection.placa, inspection.kilometraje, inspection.tipoServicio, inspection.observaciones]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(value));
  });

  const totalListedItems = avaluosTotal + filteredLocalInspections.length;

  const formatDate = (date?: string | null) => {
    if (!date) {
      return 'Sin fecha';
    }

    return new Date(date).toLocaleDateString('es-CO');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {isLoggedIn ? (
          <View style={styles.topBar}>
            <Text style={styles.topBarTitle}></Text>
            <Pressable
              style={styles.logoutButton}
              onPress={async () => {
                await logout();
                clearAuthenticatedState();
              }}>
              <Ionicons name="log-out-outline" size={22} color="#FFF" />
              <Text style={styles.logoutText}>Cerrar sesión</Text>
            </Pressable>
          </View>
        ) : null}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, isLoggedIn ? styles.loggedContent : null]}
          keyboardShouldPersistTaps="handled">

          <View style={styles.card}>            
            {!isLoggedIn ? (
              <Image source={require('../../assets/images/logo.png')} style={styles.logoImage} resizeMode="contain" />
            ) : null}
            <Text style={styles.title}>Inspección Vehicular</Text>

            {!isLoggedIn ? (
              <>
                <TextInput
                  style={styles.input}
                  value={user}
                  onChangeText={setUser}
                  placeholder="Usuario"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Contraseña"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                />
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                <Text style={styles.helperText}>Ingresa con el usuario registrado en El Evaluador.</Text>
                <Pressable
                  style={[styles.primaryButton, isLoading ? styles.disabledButton : null]}
                  onPress={handleLogin}
                  disabled={isLoading}>
                  <Text style={styles.primaryButtonText}>{isLoading ? 'Ingresando...' : 'Ingresar'}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable style={styles.primaryButton} onPress={() => router.push('/explore')}>
                  <Text style={styles.primaryButtonText}>Inspeccionar</Text>
                </Pressable>


                {pendingInspections > 0 ? (
                  <View style={styles.offlineCard}>
                    <View style={styles.offlineHeader}>
                      <View style={styles.offlineIconCircle}>
                        <Ionicons name="cloud-done-outline" size={22} color="#B91C1C" />
                      </View>
                      <View style={styles.offlineHeaderText}>
                        <Text style={styles.offlineTitle}>Guardado local automático</Text>
                        <Text style={styles.offlineSubtitle}>{pendingInspections} pendiente(s) por sincronizar</Text>
                      </View>
                    </View>
                    <Text style={styles.offlineText}>
                      Cada inspección pendiente aparece en el listado aunque no haya internet. Puedes editarla y la app seguirá intentando sincronizarla sola con Laravel.
                    </Text>
                    <Pressable
                      style={[styles.syncButton, isSyncingInspections ? styles.disabledButton : null]}
                      onPress={handleSyncPendingInspections}
                      disabled={isSyncingInspections}>
                      <Text style={styles.syncButtonText}>{isSyncingInspections ? 'Sincronizando...' : 'Sincronizar ahora'}</Text>
                    </Pressable>
                  </View>
                ) : null}

                <View style={styles.listHeader}>
                  <Text style={styles.listTitle}>Listado de inspecciones ({totalListedItems})</Text>
                  <Pressable style={styles.refreshButton} onPress={() => loadAvaluosMovil(search)} disabled={isLoadingAvaluos}>
                    <Ionicons name="refresh" size={18} color="#B91C1C" />
                    <Text style={styles.refreshText}>Actualizar</Text>
                  </Pressable>
                </View>

                <View style={styles.searchRow}>
                  <TextInput
                    style={[styles.input, styles.searchInput]}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Buscar placa, solicitante o documento"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="characters"
                    returnKeyType="search"
                    onSubmitEditing={handleSearch}
                  />
                  <Pressable style={styles.searchButton} onPress={handleSearch} disabled={isLoadingAvaluos}>
                    <Ionicons name="search" size={20} color="#FFF" />
                  </Pressable>
                </View>

                {avaluosError ? <Text style={styles.errorText}>{avaluosError}</Text> : null}
                {isLoadingAvaluos ? <Text style={styles.emptyText}>Cargando avalúos...</Text> : null}
                {filteredLocalInspections.map((inspection) => (
                  <Pressable
                    key={inspection.id}
                    style={[styles.listItem, styles.localListItem]}
                    onPress={() => router.push({ pathname: '/explore', params: { inspectionId: inspection.id } })}>
                    <View style={styles.listItemHeader}>
                      <Text style={styles.listPlate}>{inspection.placa || 'Sin placa'}</Text>
                      <Text style={styles.localBadge}>
                        {inspection.syncStatus === 'sent' ? 'Sincronizada' : 'Guardada local'}
                      </Text>
                    </View>
                    <Text style={styles.listMeta}>Servicio: {inspection.tipoServicio}</Text>
                    <Text style={styles.listMeta}>Kilometraje: {inspection.kilometraje || 'N/A'}</Text>
                    <Text style={styles.listMeta}>Fecha: {formatDate(inspection.createdAt)}</Text>
                    <Text style={styles.editHint}>Toca para editar y volver a sincronizar</Text>
                  </Pressable>
                ))}

                {!isLoadingAvaluos && avaluos.length === 0 && filteredLocalInspections.length === 0 ? (
                  <Text style={styles.emptyText}>No hay inspecciones para mostrar.</Text>
                ) : (
                  avaluos.map((item) => (
                    <View key={item.id} style={styles.listItem}>
                      <View style={styles.listItemHeader}>
                        <Text style={styles.listPlate}>{item.ingreso?.placa || 'Sin placa'}</Text>
                        <Text style={styles.listDate}>{formatDate(item.updated_at)}</Text>
                      </View>
                      <Text style={styles.listMeta}>{formatVehicle(item)}</Text>
                      <Text style={styles.listMeta}>Solicitante: {item.ingreso?.solicitante || 'N/A'}</Text>
                      <Text style={styles.listMeta}>Servicio: {item.ingreso?.tiposervicio || item.tipo || 'N/A'}</Text>
                      {item.consecutivo ? <Text style={styles.listMeta}>Consecutivo: {item.consecutivo}</Text> : null}
                    </View>
                  ))
                )}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F5' },
  container: { flex: 1 },
  topBar: {
    width: '100%',
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  topBarTitle: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  logoutButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoutText: { color: '#FFF', fontWeight: '600' },
  scroll: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  loggedContent: { justifyContent: 'flex-start', paddingTop: 8, paddingBottom: 28 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    shadowColor: '#991B1B',
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  logoMark: {
    alignSelf: 'center',
  },
  logoImage: { alignSelf: 'center', width: 200, height: 80, marginBottom: 12 },
  brandText: {
    alignSelf: 'center',
    letterSpacing: 3,
    color: '#3F3F46',
    marginBottom: 10,
    fontSize: 16,
  },
  title: {
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: '#B91C1C',
    marginBottom: 20,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: '#FAFAFA',
  },
  helperText: { textAlign: 'center', color: '#52525B', marginBottom: 12, fontSize: 12 },
  errorText: { color: '#DC2626', marginBottom: 8 },
  primaryButton: {
    backgroundColor: '#E11D2E',
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryButtonText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  disabledButton: { opacity: 0.7 },

  offlineCard: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 14,
  },
  offlineHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  offlineIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineHeaderText: { flex: 1 },
  offlineTitle: { color: '#9A3412', fontWeight: '800', fontSize: 15 },
  offlineSubtitle: { color: '#B91C1C', fontWeight: '600', fontSize: 12, marginTop: 2 },
  offlineText: { color: '#7C2D12', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  syncButton: {
    backgroundColor: '#B91C1C',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  syncButtonText: { color: '#FFF', fontWeight: '700' },
  listHeader: {
    marginTop: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  listTitle: { flex: 1, fontWeight: '700', color: '#3F3F46' },
  refreshButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  refreshText: { color: '#B91C1C', fontWeight: '600', fontSize: 12 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  searchInput: { flex: 1, marginBottom: 0 },
  searchButton: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#E11D2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: '#71717A' },
  listItem: {
    backgroundColor: '#FFF1F2',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  localListItem: { backgroundColor: '#FFFFFF', borderColor: '#F87171' },
  listItemHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 2 },
  listPlate: { fontWeight: '700', color: '#B91C1C' },
  listDate: { color: '#71717A', fontSize: 12 },
  listMeta: { color: '#52525B', marginTop: 2 },
  localBadge: {
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  editHint: { color: '#B91C1C', fontSize: 12, fontWeight: '600', marginTop: 8 },
});
