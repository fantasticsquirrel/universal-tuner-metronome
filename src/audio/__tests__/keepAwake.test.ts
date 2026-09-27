import { deactivateKeepAwake } from 'expo-keep-awake';

import { deactivateKeepAwakeIfActive } from '../keepAwake';

jest.mock('expo-keep-awake', () => ({
  deactivateKeepAwake: jest.fn(),
}));

const mockDeactivateKeepAwake = jest.mocked(deactivateKeepAwake);

describe('keep-awake cleanup', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('allows cleanup when the tag was never activated', async () => {
    const error = Object.assign(new Error('The wake lock has not activated yet'), {
      code: 'ERR_KEEP_AWAKE_TAG_INVALID',
    });
    mockDeactivateKeepAwake.mockRejectedValueOnce(error);

    await expect(deactivateKeepAwakeIfActive('test-tag')).resolves.toBeUndefined();
    expect(mockDeactivateKeepAwake).toHaveBeenCalledWith('test-tag');
  });

  it('does not hide unrelated deactivation failures', async () => {
    const error = Object.assign(new Error('Wake lock release failed'), {
      code: 'ERR_KEEP_AWAKE_RELEASE_FAILED',
    });
    mockDeactivateKeepAwake.mockRejectedValueOnce(error);

    await expect(deactivateKeepAwakeIfActive('test-tag')).rejects.toBe(error);
  });
});
