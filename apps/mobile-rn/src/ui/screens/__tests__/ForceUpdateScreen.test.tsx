// Тесты для src/ui/screens/ForceUpdateScreen.tsx (Phase 1 / REL-02).
//
// Покрывают плановые behaviors 8-10:
//   8. required=false → null (не рендерит)
//   9. required=true → Modal с русскими строками "Требуется обновление"
//      и кнопкой "Обновить сейчас"
//   10. press "Обновить сейчас" → Linking.openURL(forceUpdateUrl)

import { render, fireEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { useForceUpdateStore } from '../../../state/forceUpdate';
import { ForceUpdateScreen } from '../ForceUpdateScreen';

// Mock Linking.openURL — реальный imitates Promise<void>.
jest.spyOn(Linking, 'openURL').mockImplementation(() => Promise.resolve());

describe('ForceUpdateScreen', () => {
  beforeEach(() => {
    useForceUpdateStore.getState().reset();
    (Linking.openURL as jest.Mock).mockClear();
  });

  it('renders null when required=false', () => {
    const tree = render(<ForceUpdateScreen />);
    // queryByText returns null when nothing rendered
    expect(tree.queryByText(/Требуется обновление/)).toBeNull();
  });

  it('renders Russian-language Modal when required=true', () => {
    useForceUpdateStore.getState().set({
      required: true,
      minVersion: '1.0.0',
      forceUpdateUrl: 'https://example.com/update',
    });
    const tree = render(<ForceUpdateScreen />);
    expect(tree.getByText(/Требуется обновление/)).toBeTruthy();
    expect(tree.getByText(/Обновить сейчас/)).toBeTruthy();
  });

  it('calls Linking.openURL with forceUpdateUrl when Обновить is pressed', () => {
    useForceUpdateStore.getState().set({
      required: true,
      minVersion: '1.0.0',
      forceUpdateUrl: 'https://example.com/update',
    });
    const tree = render(<ForceUpdateScreen />);
    const btn = tree.getByText(/Обновить сейчас/);
    fireEvent.press(btn);
    expect(Linking.openURL).toHaveBeenCalledWith('https://example.com/update');
  });

  it('does not call Linking.openURL when forceUpdateUrl is empty', () => {
    useForceUpdateStore.getState().set({
      required: true,
      minVersion: '1.0.0',
      forceUpdateUrl: '',
    });
    const tree = render(<ForceUpdateScreen />);
    const btn = tree.getByText(/Обновить сейчас/);
    fireEvent.press(btn);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
});
