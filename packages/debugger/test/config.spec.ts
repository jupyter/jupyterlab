// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { init } from './utils';

init();

import { DebuggerConfig } from '../src/config';

describe('DebuggerConfig', () => {
  const kernel = 'python';
  let config: DebuggerConfig;

  beforeEach(() => {
    config = new DebuggerConfig();
  });

  describe('#getCodeId', () => {
    it('should compute a valid code id when the parameters are set', () => {
      const [prefix, suffix] = ['foo', 'bar'];
      config.setHashParams({ method: 'Murmur2', seed: 'bar', kernel });
      config.setTmpFileParams({ prefix, suffix, kernel });
      const codeId = config.getCodeId('i = 0', kernel);
      expect(codeId.startsWith(prefix)).toBe(true);
      expect(codeId.endsWith(suffix)).toBe(true);
    });

    it('should support other hash functions than Murmur2', () => {
      const [prefix, suffix] = ['foo', 'bar'];
      config.setHashParams({ method: 'Murmur3', seed: 'baz', kernel });
      config.setTmpFileParams({ prefix, suffix, kernel });
      const codeId = config.getCodeId('i = 0', kernel);
      expect(codeId.startsWith(prefix)).toBe(true);
      expect(codeId.endsWith(suffix)).toBe(true);
    });

    it('should throw if the kernel does not have hash parameters', () => {
      config.setTmpFileParams({ prefix: 'foo', suffix: 'bar', kernel });
      expect(() => {
        config.getCodeId('i = 0', kernel);
      }).toThrow('has no hashing params');
    });

    it('should throw if the kernel does not have tmp file parameters', () => {
      config.setHashParams({ method: 'Murmur2', seed: 'bar', kernel });
      expect(() => {
        config.getCodeId('i = 0', kernel);
      }).toThrow('has no tmp file params');
    });
  });
});
