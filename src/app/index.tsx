import { FirebaseError } from 'firebase/app';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/providers/AuthProvider';
import { createAssessment } from '@/services/assessments';

function getAssessmentErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'permission-denied':
      case 'firestore/permission-denied':
        return 'You do not have permission to create an assessment.';
      case 'unavailable':
      case 'firestore/unavailable':
        return 'Firestore is unavailable. Check your connection.';
    }
  }

  return 'Unable to create the assessment. Please try again.';
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [startingAssessment, setStartingAssessment] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleStartAssessment() {
    if (!user || startingAssessment) {
      return;
    }

    setStartingAssessment(true);
    setErrorMessage(null);

    try {
      const assessmentId = await createAssessment(user.uid);
      router.push({
        pathname: '/assessment/[assessmentId]',
        params: { assessmentId },
      });
    } catch (error: unknown) {
      setErrorMessage(getAssessmentErrorMessage(error));
    } finally {
      setStartingAssessment(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    setErrorMessage(null);

    try {
      await signOut();
    } catch {
      setErrorMessage('Unable to sign out. Please try again.');
      setSigningOut(false);
    }
  }

  const actionInProgress = startingAssessment || signingOut;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <View style={styles.accent} />
        <Text style={styles.title}>AI Inspection</Text>
        <Text style={styles.subtitle}>Mobile Frontend</Text>
        <Text style={styles.account}>
          Signed in as {user?.email ?? 'authenticated user'}
        </Text>

        {errorMessage ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {errorMessage}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          disabled={actionInProgress}
          onPress={() => void handleStartAssessment()}
          style={({ pressed }) => [
            styles.primaryButton,
            actionInProgress && styles.buttonDisabled,
            pressed && !actionInProgress && styles.primaryButtonPressed,
          ]}>
          {startingAssessment ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Start New Assessment</Text>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={actionInProgress}
          onPress={() => void handleSignOut()}
          style={({ pressed }) => [
            styles.logoutButton,
            actionInProgress && styles.buttonDisabled,
            pressed && !actionInProgress && styles.logoutButtonPressed,
          ]}>
          {signingOut ? (
            <ActivityIndicator color="#1D4ED8" />
          ) : (
            <Text style={styles.logoutButtonText}>Logout</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  accent: {
    width: 48,
    height: 4,
    marginBottom: 24,
    borderRadius: 2,
    backgroundColor: '#2563EB',
  },
  title: {
    color: '#111827',
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    color: '#4B5563',
    fontSize: 22,
    fontWeight: '500',
    textAlign: 'center',
  },
  account: {
    marginTop: 18,
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
  },
  error: {
    marginTop: 16,
    color: '#B91C1C',
    fontSize: 14,
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    maxWidth: 320,
    minHeight: 50,
    marginTop: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#2563EB',
  },
  primaryButtonPressed: {
    backgroundColor: '#1D4ED8',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  logoutButton: {
    minWidth: 140,
    minHeight: 48,
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2563EB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  logoutButtonPressed: {
    backgroundColor: '#EFF6FF',
  },
  logoutButtonText: {
    color: '#1D4ED8',
    fontSize: 16,
    fontWeight: '700',
  },
});
