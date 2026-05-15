// Toast component test.
// Phase 1 / PHASE1-08. Покрывает: useToast() default no-op, show() рендерит
// текст, fade-out возвращает msg к null, повторный show() заменяет первый.

import type { ReactElement } from 'react';
import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';

// Mock design barrel: реальный barrel импортирует ThemeProvider → MMKV (нативный
// модуль, не работает под jest-expo). Возвращаем минимально-достаточный
// useTheme stub — Toast.tsx читает `t.lime` и `t.text`.
jest.mock('../design', () => ({
  useTheme: () => ({ lime: '#C6F560', text: '#FFFFFF' }),
}));

import { ToastProvider, useToast } from '../ui/Toast';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Toast', () => {
  it('useToast() outside ToastProvider returns a no-op show', () => {
    // Создаём «consumer» вне provider'а. Default context — { show: () => {} },
    // вызов не должен бросать и не должен ничего рендерить.
    function Consumer(): ReactElement {
      const { show } = useToast();
      // Вызываем — должно быть тихо.
      show('ignored');
      return <Text testID="no-op-consumer">ok</Text>;
    }
    const { queryByTestId, getByTestId } = render(<Consumer />);
    expect(getByTestId('no-op-consumer')).toBeTruthy();
    expect(queryByTestId('toast-text')).toBeNull();
  });

  it('inside ToastProvider, show("hi") mounts <Text> with "hi", then unmounts after timers', () => {
    let triggerShow: (text: string) => void = () => {};

    function Consumer(): ReactElement {
      const { show } = useToast();
      triggerShow = show;
      return <Text testID="consumer">ok</Text>;
    }

    const { queryByTestId, getByTestId } = render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    );

    // Перед show — нет тоста.
    expect(queryByTestId('toast-text')).toBeNull();

    // Показ.
    act(() => {
      triggerShow('hi');
    });

    // Тост смонтирован сразу — fade-in держит opacity, но Text уже в дереве.
    expect(getByTestId('toast-text').props.children).toBe('hi');

    // Прогоняем таймеры: 200 fade-in + 2500 hold + 300 fade-out = 3000ms.
    act(() => {
      jest.advanceTimersByTime(3500);
    });

    // После завершения sequence — msg === null → unmounted.
    expect(queryByTestId('toast-text')).toBeNull();
  });

  it('show("first") then show("second") replaces the first message', () => {
    let triggerShow: (text: string) => void = () => {};

    function Consumer(): ReactElement {
      const { show } = useToast();
      triggerShow = show;
      return <Text testID="consumer">ok</Text>;
    }

    const { getByTestId } = render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    );

    act(() => {
      triggerShow('first');
    });
    expect(getByTestId('toast-text').props.children).toBe('first');

    // Прежде чем первый исчез — показываем второй.
    act(() => {
      triggerShow('second');
    });

    // Второй заменяет первый.
    expect(getByTestId('toast-text').props.children).toBe('second');
  });
});
