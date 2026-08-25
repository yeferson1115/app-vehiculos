import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { logout } from '@/services/auth';
import {
  createInspectionItem,
  getStoredInspections,
  INSPECTION_SERVICE_TYPES,
  InspectionImage,
  InspectionItem,
  InspectionServiceType,
  saveInspectionWithImmediateSync,
} from '@/services/inspections';

const normalizePlate = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

const extractPlateFromUri = (uri: string) => {
  const match = uri.toUpperCase().match(/[A-Z]{3}[0-9]{3}|[A-Z]{3}[0-9]{2}[A-Z]/);
  return match?.[0] ?? '';
};

const getImageName = (uri: string, index: number, fileName?: string | null) => {
  if (fileName) {
    return fileName;
  }

  const name = uri.split('/').pop()?.split('?')[0];
  return name || `inspeccion-${index + 1}.jpg`;
};

const getImageType = (uri: string, mimeType?: string | null) => {
  if (mimeType?.startsWith('image/')) {
    return mimeType;
  }

  const extension = uri.split('.').pop()?.toLowerCase().split('?')[0];

  if (extension === 'png') {
    return 'image/png';
  }

  if (extension === 'webp') {
    return 'image/webp';
  }

  return 'image/jpeg';
};

const toDataUri = (base64: string | null | undefined, type: string) => {
  if (!base64) {
    return null;
  }

  return base64.startsWith('data:') ? base64 : `data:${type};base64,${base64}`;
};

const getMaxImagesByService = (serviceType: InspectionServiceType) => (serviceType === 'Sec Bogota' ? 10 : 30);

const persistLocalImage = async (uri: string, name: string) => {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory || !uri.startsWith('file://')) {
    return uri;
  }

  const directory = `${FileSystem.documentDirectory}inspection-images/`;
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const destination = `${directory}${Date.now()}-${safeName}`;

  try {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    await FileSystem.copyAsync({ from: uri, to: destination });
    return destination;
  } catch {
    return uri;
  }
};

const pickImage = async ({ base64 = false }: { base64?: boolean } = {}) => {
  const includeBase64 = base64;
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();

    if (!cameraPermission.granted) {
      Alert.alert('Permiso requerido', 'Debes permitir acceso a la cámara.');
      return null;
    }

    return ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: includeBase64 ? 0.7 : 0.55,
      base64: includeBase64,
    });
  }

  const mediaLibraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!mediaLibraryPermission.granted) {
    Alert.alert('Permiso requerido', 'Debes permitir acceso a las imágenes.');
    return null;
  }

  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: includeBase64 ? 0.7 : 0.55,
    base64: includeBase64,
  });
};

export default function NewInspectionScreen() {
  const { inspectionId } = useLocalSearchParams<{ inspectionId?: string }>();
  const [editingInspection, setEditingInspection] = useState<InspectionItem | null>(null);
  const [placa, setPlaca] = useState('');
  const [kilometraje, setKilometraje] = useState('');
  const [tipoServicio, setTipoServicio] = useState<InspectionServiceType>('Avaluo');
  const [isServiceSelectOpen, setIsServiceSelectOpen] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [imagenes, setImagenes] = useState<InspectionImage[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savedPromptVisible, setSavedPromptVisible] = useState(false);
  const [savedPromptMessage, setSavedPromptMessage] = useState('Ingreso móvil guardado correctamente. ¿Deseas crear uno nuevo?');
  const [savedPromptTitle, setSavedPromptTitle] = useState('Ingreso móvil guardado');
  const [saveStatusMessage, setSaveStatusMessage] = useState('');

  useEffect(() => {
    const loadInspection = async () => {
      if (!inspectionId) {
        setEditingInspection(null);
        setPlaca('');
        setKilometraje('');
        setTipoServicio('Avaluo');
        setIsServiceSelectOpen(false);
        setObservaciones('');
        setImagenes([]);
        setSavedPromptVisible(false);
        setSavedPromptMessage('Ingreso móvil guardado correctamente. ¿Deseas crear uno nuevo?');
        setSavedPromptTitle('Ingreso móvil guardado');
        setSaveStatusMessage('');
        return;
      }

      const inspections = await getStoredInspections();
      const inspection = inspections.find((item) => item.id === inspectionId);

      if (!inspection) {
        Alert.alert('Inspección no encontrada', 'No se encontró la inspección guardada en este dispositivo.');
        router.replace('/');
        return;
      }

      setEditingInspection(inspection);
      setPlaca(inspection.placa);
      setKilometraje(inspection.kilometraje);
      setTipoServicio(inspection.tipoServicio);
      setIsServiceSelectOpen(false);
      setObservaciones(inspection.observaciones);
      setImagenes(inspection.imagenes);
    };

    void loadInspection();
  }, [inspectionId]);

  const capturarPlaca = async () => {
    const result = await pickImage();

    if (result && !result.canceled && result.assets[0]?.uri) {
      const detectedPlate = extractPlateFromUri(result.assets[0].uri);
      if (detectedPlate) {
        setPlaca(detectedPlate);
        Alert.alert('Placa detectada', `Se reconoció: ${detectedPlate}`);
      } else {
        Alert.alert('Sin reconocimiento automático', 'No se pudo reconocer la placa automáticamente. Puedes escribirla manualmente.');
      }
    }
  };

  const maxImages = getMaxImagesByService(tipoServicio);

  useEffect(() => {
    const serviceMaxImages = getMaxImagesByService(tipoServicio);

    if (imagenes.length > serviceMaxImages) {
      setImagenes((current) => current.slice(0, serviceMaxImages));
      Alert.alert(
        'Límite de imágenes ajustado',
        `Para ${tipoServicio} solo se permiten ${serviceMaxImages} imágenes. Se conservaron las primeras ${serviceMaxImages}.`,
      );
    }
  }, [imagenes.length, tipoServicio]);

  const agregarImagen = async () => {
    if (imagenes.length >= maxImages) {
      Alert.alert('Límite alcanzado', `Solo se permiten ${maxImages} imágenes para ${tipoServicio}.`);
      return;
    }

    const result = await pickImage({ base64: true });

    if (result && !result.canceled && result.assets[0]?.uri) {
      const asset = result.assets[0];
      const index = imagenes.length;
      const type = getImageType(asset.uri, asset.mimeType);
      const name = getImageName(asset.uri, index, asset.fileName);
      const persistentUri = await persistLocalImage(asset.uri, name);
      const image: InspectionImage = {
        uri: persistentUri,
        name,
        type,
        dataUri: toDataUri(asset.base64, type),
        syncStatus: 'pending',
        syncAttempts: 0,
        syncedAt: null,
        lastSyncError: null,
      };

      setImagenes((prev) => [...prev, image]);
    }
  };

  const resetForm = () => {
    setEditingInspection(null);
    setPlaca('');
    setKilometraje('');
    setTipoServicio('Avaluo');
    setIsServiceSelectOpen(false);
    setObservaciones('');
    setImagenes([]);
    setSavedPromptVisible(false);
    setSavedPromptMessage('Ingreso móvil guardado correctamente. ¿Deseas crear uno nuevo?');
    setSavedPromptTitle('Ingreso móvil guardado');
    setSaveStatusMessage('');
  };

  const getSyncFailureMessage = (inspection: InspectionItem) => (
    `La inspección quedó guardada en este dispositivo, pero no se pudo sincronizar ahora.${inspection.lastSyncError ? ` Detalle: ${inspection.lastSyncError}` : ''} Se enviará automáticamente cuando haya internet.`
  );

  const showCreateAnotherPrompt = (
    message = 'Ingreso móvil guardado correctamente. ¿Deseas crear uno nuevo?',
    title = 'Ingreso móvil guardado',
  ) => {
    setSavedPromptTitle(title);
    setSavedPromptMessage(message);
    setSavedPromptVisible(true);
  };

  const handleCreateAnotherInspection = () => {
    setSavedPromptVisible(false);
    resetForm();
  };

  const handleGoToInspectionList = () => {
    setSavedPromptVisible(false);
    router.replace('/');
  };

  const guardar = async () => {
    if (isSaving) {
      setSaveStatusMessage('Ya se está guardando la inspección. Espera un momento.');
      return;
    }

    if (!placa.trim()) {
      const requiredMessage = 'Debes ingresar o capturar una placa.';
      setSaveStatusMessage(requiredMessage);
      Alert.alert('Campo requerido', requiredMessage);
      return;
    }

    const isEditing = Boolean(editingInspection);
    const inspectionData = {
      placa: normalizePlate(placa),
      kilometraje,
      tipoServicio,
      observaciones,
      imagenes,
    };

    setSavedPromptVisible(false);
    setSaveStatusMessage('Enviando inspección al API...');
    setIsSaving(true);

    try {
      const inspection = editingInspection
        ? { ...editingInspection, ...inspectionData }
        : createInspectionItem(inspectionData);
      const syncedItem = await saveInspectionWithImmediateSync(inspection);
      const wasSynced = syncedItem.syncStatus === 'sent';
      const resultMessage = wasSynced
        ? 'Ingreso móvil guardado y enviado correctamente.'
        : getSyncFailureMessage(syncedItem);

      if (!isEditing) {
        setEditingInspection(syncedItem);
      }

      setSaveStatusMessage(resultMessage);
      showCreateAnotherPrompt(
        `${resultMessage} ¿Deseas crear uno nuevo?`,
        wasSynced ? 'Inspección sincronizada' : 'Inspección guardada localmente',
      );
    } catch {
      const errorMessage = 'Ocurrió un error al guardar la inspección. Intenta nuevamente.';
      setSaveStatusMessage(errorMessage);
      Alert.alert(
        'No se pudo guardar',
        errorMessage,
      );
    } finally {
      setIsSaving(false);
    }
  };


  const cancelar = () => {
    router.replace('/');
  };

  const cerrarSesion = async () => {
    await logout();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}></Text>
          <Pressable style={styles.logoutButton} onPress={cerrarSesion}>
            <Ionicons name="log-out-outline" size={22} color="#FFF" />
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </Pressable>
        </View>

        <View style={styles.formContent}>
          <Text style={styles.title}>{editingInspection ? 'Editar inspección' : 'Nueva inspección'}</Text>

          <Text style={styles.label}>Placa</Text>
          <TextInput
            style={styles.input}
            value={placa}
            onChangeText={(text) => setPlaca(normalizePlate(text))}
            placeholder="Número de placa"
            autoCapitalize="characters"
          />

          <Pressable style={styles.secondaryButton} onPress={capturarPlaca}>
            <Ionicons name="camera-outline" size={20} color="#B91C1C" />
            <Text style={styles.secondaryButtonText}>Tomar foto para reconocer placa</Text>
          </Pressable>

          <TextInput
            style={styles.input}
            value={kilometraje}
            onChangeText={setKilometraje}
            keyboardType="numeric"
            placeholder="Kilometraje"
          />

          <Text style={styles.label}>Tipo de Servicio</Text>
          <Pressable
            style={styles.selectButton}
            onPress={() => setIsServiceSelectOpen((current) => !current)}>
            <Text style={styles.selectButtonText}>{tipoServicio}</Text>
            <Ionicons
              name={isServiceSelectOpen ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={20}
              color="#B91C1C"
            />
          </Pressable>
          {isServiceSelectOpen ? (
            <View style={styles.selectOptions}>
              {INSPECTION_SERVICE_TYPES.map((serviceType) => (
                <Pressable
                  key={serviceType}
                  style={[
                    styles.selectOption,
                    tipoServicio === serviceType ? styles.selectedOption : null,
                  ]}
                  onPress={() => {
                    const serviceMaxImages = getMaxImagesByService(serviceType);

                    if (imagenes.length > serviceMaxImages) {
                      Alert.alert(
                        'Límite de imágenes',
                        `Para ${serviceType} solo se permiten ${serviceMaxImages} imágenes. Se conservarán las primeras ${serviceMaxImages}.`,
                      );
                      setImagenes((current) => current.slice(0, serviceMaxImages));
                    }

                    setTipoServicio(serviceType);
                    setIsServiceSelectOpen(false);
                  }}>
                  <Text
                    style={[
                      styles.selectOptionText,
                      tipoServicio === serviceType ? styles.selectedOptionText : null,
                    ]}>
                    {serviceType}
                  </Text>
                  {tipoServicio === serviceType ? (
                    <Ionicons name="checkmark-circle" size={18} color="#B91C1C" />
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          <TextInput
            style={[styles.input, styles.multiline]}
            value={observaciones}
            onChangeText={setObservaciones}
            placeholder="Observaciones"
            multiline
          />

          <Pressable style={styles.secondaryButton} onPress={agregarImagen}>
            <Ionicons name="camera-reverse-outline" size={20} color="#B91C1C" />
            <Text style={styles.secondaryButtonText}>Cargar imagen con cámara ({imagenes.length}/{maxImages})</Text>
          </Pressable>

          <View style={styles.grid}>
            {imagenes.map((image) => (
              <View key={`${image.uri}-${image.name}`} style={styles.previewContainer}>
                <Image source={{ uri: image.uri }} style={styles.preview} />
                <View style={[
                  styles.imageSyncBadge,
                  image.syncStatus === 'sent' ? styles.imageSyncBadgeSent : styles.imageSyncBadgePending,
                ]}>
                  <Ionicons
                    name={image.syncStatus === 'sent' ? 'cloud-done' : 'cloud-upload-outline'}
                    size={13}
                    color="#FFF"
                  />
                  <Text style={styles.imageSyncBadgeText}>{image.syncStatus === 'sent' ? 'Subida' : 'Pendiente'}</Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable
            style={[styles.primaryButton, isSaving ? styles.disabledButton : null]}
            onPress={() => { void guardar(); }}
            disabled={isSaving}>
            <Text style={styles.primaryButtonText}>
              {isSaving ? 'Guardando...' : editingInspection ? 'Actualizar' : 'Guardar'}
            </Text>
          </Pressable>

          {saveStatusMessage ? <Text style={styles.saveStatusText}>{saveStatusMessage}</Text> : null}

          <Pressable style={styles.cancelButton} onPress={cancelar}>
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </Pressable>

        </View>
      </ScrollView>

      <Modal
        transparent
        animationType="fade"
        visible={savedPromptVisible}
        onRequestClose={handleGoToInspectionList}>
        <View style={styles.alertOverlay}>
          <View style={styles.alertCard}>
            <Text style={styles.alertTitle}>{savedPromptTitle}</Text>
            <Text style={styles.alertMessage}>{savedPromptMessage}</Text>
            <View style={styles.alertActions}>
              <Pressable
                style={[styles.alertButton, styles.alertSecondaryButton]}
                onPress={handleGoToInspectionList}>
                <Text style={styles.alertSecondaryText}>No</Text>
              </Pressable>
              <Pressable
                style={[styles.alertButton, styles.alertPrimaryButton]}
                onPress={handleCreateAnotherInspection}>
                <Text style={styles.alertPrimaryText}>Sí</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F5F5' },
  scroll: { flex: 1 },
  container: { flexGrow: 1, paddingBottom: 32 },
  topBar: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    width: '100%',
  },
  topBarTitle: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  logoutButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoutText: { color: '#FFF', fontWeight: '600' },
  formContent: { paddingHorizontal: 20 },
  title: { fontSize: 26, fontWeight: '700', color: '#B91C1C', marginBottom: 16 },
  label: { fontWeight: '600', color: '#3F3F46', marginBottom: 8 },
  input: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  selectButton: {
    minHeight: 50,
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectButtonText: { color: '#3F3F46', fontWeight: '600' },
  selectOptions: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    marginTop: -4,
    marginBottom: 12,
    overflow: 'hidden',
  },
  selectOption: {
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#FEE2E2',
  },
  selectedOption: { backgroundColor: '#FFF1F2' },
  selectOptionText: { color: '#3F3F46', fontWeight: '500' },
  selectedOptionText: { color: '#B91C1C', fontWeight: '700' },
  secondaryButton: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF1F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  secondaryButtonText: { color: '#B91C1C', fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  previewContainer: { width: 94, height: 94, borderRadius: 10, overflow: 'hidden' },
  preview: { width: 94, height: 94, borderRadius: 10 },
  imageSyncBadge: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  imageSyncBadgeSent: { backgroundColor: '#15803D' },
  imageSyncBadgePending: { backgroundColor: '#B45309' },
  imageSyncBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  primaryButton: {
    backgroundColor: '#E11D2E',
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: { opacity: 0.65 },
  primaryButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  saveStatusText: { color: '#3F3F46', fontSize: 14, fontWeight: '600', marginTop: 10, marginBottom: 2 },
  cancelButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
  },
  cancelButtonText: { color: '#B91C1C', fontSize: 16, fontWeight: '700' },
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  alertCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  alertTitle: { color: '#B91C1C', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  alertMessage: { color: '#3F3F46', fontSize: 16, lineHeight: 22, marginBottom: 18 },
  alertActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  alertButton: {
    minWidth: 96,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  alertSecondaryButton: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#FCA5A5' },
  alertPrimaryButton: { backgroundColor: '#E11D2E' },
  alertSecondaryText: { color: '#B91C1C', fontSize: 16, fontWeight: '700' },
  alertPrimaryText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
