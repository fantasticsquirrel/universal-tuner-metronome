import React from 'react';
import { TextInput } from 'react-native';

import { NumberField } from '../Controls';

jest.setTimeout(20_000);
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@/store/AppProvider', () => ({ useApp: () => ({ palette: jest.requireActual('@/theme').lightPalette }) }));

const { act, create } = jest.requireActual('react-test-renderer');

describe('NumberField editing', () => {
  let renderer: ReturnType<typeof create>;
  let setValue: React.Dispatch<React.SetStateAction<number>>;
  const onChange = jest.fn();
  const input = () => renderer.root.findByType(TextInput);
  const change = async (text: string) => { await act(async () => input().props.onChangeText(text)); };
  const finish = async (event: 'onBlur' | 'onSubmitEditing') => { await act(async () => input().props[event]()); };
  const mount = async (initialValue = 440, min = 390, max = 490, normalize = (number: number) => number) => {
    function Harness() {
      const [value, updateValue] = React.useState(initialValue);
      setValue = updateValue;
      return React.createElement(NumberField, {
        label: 'Concert A', value, min, max, keyboardType: 'decimal-pad',
        onChange: (next: number) => { onChange(next); updateValue(normalize(next)); },
      });
    }
    await act(async () => { renderer = create(React.createElement(Harness)); });
    await act(async () => input().props.onFocus?.());
  };

  beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => { jest.clearAllMocks(); });
  afterEach(async () => { await act(async () => renderer?.unmount()); renderer = undefined; });

  it('allows clearing and typing each digit without clamping incomplete input', async () => {
    await mount();
    for (const text of ['', '4', '44']) {
      await change(text);
      expect(input().props.value).toBe(text);
      expect(onChange).not.toHaveBeenCalled();
    }
    await change('442');
    expect(input().props.value).toBe('442');
    expect(onChange.mock.calls).toEqual([[442]]);
    await finish('onBlur');
    expect(input().props.value).toBe('442');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it.each(['.', ','])('retains an intermediate %s and fractional trailing zeros while editing', async (separator) => {
    await mount();
    await change(`442${separator}`);
    expect(input().props.value).toBe(`442${separator}`);
    expect(onChange).not.toHaveBeenCalled();
    await change(`442${separator}50`);
    expect(input().props.value).toBe(`442${separator}50`);
    expect(onChange.mock.calls).toEqual([[442.5]]);
    await finish('onSubmitEditing');
    await finish('onBlur');
    expect(input().props.value).toBe('442.5');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it.each(['', ' ', '-', '.', '-.', 'NaN', 'Infinity', '4e2', '0x1b8', '440 Hz', '440..5', '440,5.0', '389.9', '490.1'])('reverts invalid or out-of-range %j on blur without changing tuning', async (text) => {
    await mount();
    await change(text);
    expect(input().props.value).toBe(text);
    expect(onChange).not.toHaveBeenCalled();
    await finish('onBlur');
    expect(input().props.value).toBe('440');
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([390, 490])('accepts inclusive range boundary %s', async (number) => {
    await mount();
    await change(String(number));
    expect(onChange.mock.calls).toEqual([[number]]);
  });

  it('cancels an uncommitted draft with Escape, retaining the latest accepted value', async () => {
    await mount();
    await change('442');
    await change('44');
    await act(async () => input().props.onKeyPress({ nativeEvent: { key: 'Escape' } }));
    expect(input().props.value).toBe('442');
    expect(onChange.mock.calls).toEqual([[442]]);
  });

  it('keeps a valid edit when unmounted without a blur and drops incomplete text', async () => {
    await mount();
    await change('442.5');
    await change('442.');
    await act(async () => renderer.unmount());
    renderer = undefined;
    expect(onChange.mock.calls).toEqual([[442.5]]);
  });

  it('follows external values when idle without overwriting an active draft', async () => {
    await mount();
    await finish('onBlur');
    await act(async () => setValue(432));
    expect(input().props.value).toBe('432');
    await act(async () => input().props.onFocus());
    await change('44');
    await act(async () => setValue(444));
    expect(input().props.value).toBe('44');
    await finish('onBlur');
    expect(input().props.value).toBe('444');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('supports negative drafts for Detune and fractional values for Noise gate', async () => {
    await mount(0, -12, 0);
    await change('-');
    expect(input().props.value).toBe('-');
    expect(onChange).not.toHaveBeenCalled();
    await change('-2');
    expect(onChange.mock.calls).toEqual([[-2]]);
    await finish('onBlur');
    expect(input().props.value).toBe('-2');
    await act(async () => renderer.unmount());
    renderer = undefined;
    onChange.mockClear();
    await mount(1, 0.1, 10);
    await change('.');
    await change('.5');
    expect(onChange.mock.calls).toEqual([[0.5]]);
    await finish('onBlur');
    expect(input().props.value).toBe('0.5');
  });

  it('does not publish unchanged values', async () => {
    await mount();
    await change('440.00');
    expect(input().props.value).toBe('440.00');
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => setValue(441));
    await finish('onBlur');
    expect(input().props.value).toBe('441');
  });

  it('shows the parent-rounded value when an integer field finishes editing', async () => {
    await mount(0, 0, 12, Math.round);
    await change('1.5');
    expect(input().props.value).toBe('1.5');
    expect(onChange.mock.calls).toEqual([[1.5]]);
    await finish('onBlur');
    expect(input().props.value).toBe('2');
  });
});
