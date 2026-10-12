import React from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { TuningGauge } from '../TuningGauge';
import { lightPalette } from '@/theme';
import { DEFAULT_STATE } from '@/lib/persistedState';

// First native-component transform/render can exceed Jest's default on CI.
jest.setTimeout(20_000);

jest.mock('@/store/AppProvider', () => ({ useApp: jest.fn() }));
const { act, create } = jest.requireActual('react-test-renderer');
const appMock = jest.requireMock('@/store/AppProvider');

describe('native-driven tuning gauge', () => {
  let renderer: ReturnType<typeof create>;
  let animations: { start: jest.Mock; stop: jest.Mock; reset: jest.Mock }[];
  let timing: jest.SpyInstance;
  beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    renderer = undefined;
    animations = [];
    appMock.useApp.mockReturnValue({ palette: lightPalette, state: DEFAULT_STATE });
    timing = jest.spyOn(Animated, 'timing').mockImplementation(() => {
      const animation = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
      animations.push(animation);
      return animation;
    });
  });
  afterEach(async () => { await act(async () => renderer?.unmount()); jest.restoreAllMocks(); });
  const render = async (cents: number, active = true, tolerance = 3) => {
    await act(async () => {
      const element = React.createElement(TuningGauge, { cents, active, tolerance });
      if (renderer) renderer.update(element);
      else renderer = create(element);
    });
  };
  const layout = async (width: number) => {
    const track = renderer.root.findByProps({ testID: 'tuning-gauge-track' });
    await act(async () => track.props.onLayout({ nativeEvent: { layout: { width } } }));
  };
  const label = () => renderer.root.findAll((node: { props: { accessible?: boolean; accessibilityLabel?: string } }) => node.props.accessible && Boolean(node.props.accessibilityLabel))[0].props.accessibilityLabel;

  it('uses measured pixel translateX, native timing and cancels superseded/unmounted animations', async () => {
    await render(25);
    expect(timing).not.toHaveBeenCalled();
    await layout(200);
    expect(timing).toHaveBeenLastCalledWith(expect.any(Animated.Value), expect.objectContaining({ toValue: 50, useNativeDriver: true }));
    expect(animations[0]!.start).toHaveBeenCalledTimes(1);
    const marker = renderer.root.findByProps({ testID: 'tuning-gauge-marker' });
    const style = StyleSheet.flatten(marker.props.style);
    expect(style.left).toBe('50%');
    expect(style.transform[0].translateX).toBe(timing.mock.calls[0]![0]);
    await render(-100);
    expect(animations[0]!.stop).toHaveBeenCalledTimes(1);
    expect(timing).toHaveBeenLastCalledWith(expect.any(Animated.Value), expect.objectContaining({ toValue: -100, useNativeDriver: true }));
    await layout(400);
    expect(timing).toHaveBeenLastCalledWith(expect.any(Animated.Value), expect.objectContaining({ toValue: -200 }));
    await render(100);
    expect(timing).toHaveBeenLastCalledWith(expect.any(Animated.Value), expect.objectContaining({ toValue: 200 }));
    await render(100, false);
    expect(timing).toHaveBeenLastCalledWith(expect.any(Animated.Value), expect.objectContaining({ toValue: 0 }));
    await act(async () => renderer.unmount());
    renderer = undefined;
    expect(animations[animations.length - 1]!.stop).toHaveBeenCalledTimes(1);
  });

  it('keeps exact accessible cents, tolerance, direction and text independently of animation', async () => {
    await render(3);
    expect(label()).toBe('+3.0 ¢, IN TUNE');
    await render(3.1);
    expect(label()).toBe('+3.1 ¢, ↓ Tune down · Sharp');
    await render(-3.1);
    expect(label()).toBe('-3.1 ¢, ↑ Tune up · Flat');
    await render(3.1, true, 4);
    expect(label()).toBe('+3.1 ¢, IN TUNE');
    await render(30, false);
    expect(label()).toBe('Play a steady note');
    expect(renderer.root.findAllByType(Text).map((node: { props: { children: unknown } }) => node.props.children)).toContain('—');
  });

  it('honors reduced motion without scheduling an animation', async () => {
    appMock.useApp.mockReturnValue({ palette: lightPalette, state: { ...DEFAULT_STATE, preferences: { ...DEFAULT_STATE.preferences, reduceMotion: true } } });
    const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
    await render(-25);
    await layout(200);
    expect(timing).not.toHaveBeenCalled();
    expect(setValue).toHaveBeenLastCalledWith(-50);
  });
});
