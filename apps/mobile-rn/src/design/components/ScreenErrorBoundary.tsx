// ScreenErrorBoundary — generic boundary для wrap'а критичных screens.
// Phase M9.6: предотвращает crash root приложения при throw в
// children render (e.g. layout 'Infinity' value, JSON deserialization fail).
//
// Usage:
//   <ScreenErrorBoundary fallbackTitle="Не удалось открыть пост">
//     <SomeScreen />
//   </ScreenErrorBoundary>

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

type Props = {
  children: ReactNode;
  /** Title shown when an error is caught (default: "Что-то пошло не так"). */
  fallbackTitle?: string;
  /** Optional onBack handler (e.g. nav.goBack from useNavigation). */
  onBack?: () => void;
};

type State = { error: Error | null };

export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ScreenErrorBoundary]', error, info.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#0A0A0A',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Text
          style={{
            color: '#FF4D2E',
            fontSize: 20,
            fontWeight: '800',
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          {this.props.fallbackTitle ?? 'Что-то пошло не так'}
        </Text>
        <Text
          style={{
            color: '#9CA3AF',
            fontSize: 13,
            textAlign: 'center',
            lineHeight: 19,
            marginBottom: 24,
          }}
        >
          {error.name}: {error.message}
        </Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pressable
            onPress={this.handleRetry}
            style={({ pressed }) => ({
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 999,
              backgroundColor: '#C6F560',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: '#000', fontSize: 14, fontWeight: '700' }}>
              Попробовать снова
            </Text>
          </Pressable>
          {this.props.onBack ? (
            <Pressable
              onPress={this.props.onBack}
              style={({ pressed }) => ({
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.08)',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>
                Назад
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }
}
