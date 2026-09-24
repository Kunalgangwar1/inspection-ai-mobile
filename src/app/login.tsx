import { FirebaseError } from 'firebase/app';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/providers/AuthProvider';

function getSignInErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'The email or password is incorrect.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait and try again.';
      case 'auth/network-request-failed':
        return 'Unable to reach Firebase. Check your connection.';
    }
  }

  return 'Unable to sign in. Please try again.';
}

export default function LoginScreen() {
  const { signIn } = useAuth();
  const passwordInput = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && !submitting;

  async function handleSignIn() {
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await signIn(email, password);
    } catch (error: unknown) {
      setErrorMessage(getSignInErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <View style={styles.accent} />
            <Text style={styles.title}>AI Inspection</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>

            <View style={styles.form}>
              <View>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  editable={!submitting}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  onSubmitEditing={() => passwordInput.current?.focus()}
                  placeholder="you@example.com"
                  returnKeyType="next"
                  style={styles.input}
                  textContentType="emailAddress"
                  value={email}
                />
              </View>

              <View>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  ref={passwordInput}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  editable={!submitting}
                  onChangeText={setPassword}
                  onSubmitEditing={() => void handleSignIn()}
                  placeholder="Enter your password"
                  returnKeyType="done"
                  secureTextEntry
                  style={styles.input}
                  textContentType="password"
                  value={password}
                />
              </View>

              {errorMessage ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {errorMessage}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={!canSubmit}
                onPress={() => void handleSignIn()}
                style={({ pressed }) => [
                  styles.button,
                  !canSubmit && styles.buttonDisabled,
                  pressed && canSubmit && styles.buttonPressed,
                ]}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    padding: 24,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  accent: {
    width: 48,
    height: 4,
    marginBottom: 20,
    borderRadius: 2,
    backgroundColor: '#2563EB',
  },
  title: {
    color: '#111827',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 6,
    color: '#6B7280',
    fontSize: 16,
  },
  form: {
    marginTop: 28,
    gap: 18,
  },
  label: {
    marginBottom: 8,
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    height: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    color: '#111827',
    fontSize: 16,
  },
  error: {
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#2563EB',
  },
  buttonDisabled: {
    backgroundColor: '#93C5FD',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
