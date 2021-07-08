/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import { IDocumentProvider, IDocumentProviderFactory } from './tokens';
import { getAnonymousUserName, getRandomColor } from './awareness';
import * as env from 'lib0/environment';
import { IStateDB } from '@jupyterlab/statedb';

const PREFIX = '@jupyterlab/docprovider:yprovider';
const USER = `${PREFIX}:user`;
/**
 * A class to provide Yjs synchronization over WebSocket.
 *
 * The user can specify their own user-name and user-color by adding url parameters:
 *   ?username=Alice&usercolor=007007
 * where usercolor must be a six-digit hexadecimal encoded RGB value without the hash token.
 *
 * We specify custom messages that the server can interpret. For reference please look in yjs_ws_server.
 *
 */
export class WebSocketProviderWithLocks
  extends WebsocketProvider
  implements IDocumentProvider {
  /**
   * Construct a new WebSocketProviderWithLocks
   *
   * @param options The instantiation options for a WebSocketProviderWithLocks
   */
  constructor(options: WebSocketProviderWithLocks.IOptions) {
    super(
      options.url,
      options.contentType + ':' + options.path,
      options.ymodel.ydoc,
      {
        awareness: options.ymodel.awareness
      }
    );
    this._path = options.path;
    this._contentType = options.contentType;
    this._serverUrl = options.url;

    const awareness = options.ymodel.awareness;
    const currState = awareness.getLocalState();
    let color = '#' + env.getParam('--usercolor', getRandomColor().slice(1));
    let name = env.getParam('--username', getAnonymousUserName());
    const state = options.state;
    if (state) {
      const user = state.fetch(USER);
      user.then(param => {
        if (param === undefined) {
          state.save(USER, `${name},${color}`);
        } else {
          name = (param as string).split(',')[0];
          color = (param as string).split(',')[1];
        }
        // only set if this was not already set by another plugin
        if (currState && currState.name == null) {
          options.ymodel.awareness.setLocalStateField('user', {
            name,
            color
          });
        }
      });
    } else {
      // only set if this was not already set by another plugin
      if (currState && currState.name == null) {
        options.ymodel.awareness.setLocalStateField('user', {
          name,
          color
        });
      }
    }

    // Message handler that confirms when a lock has been acquired
    this.messageHandlers[127] = (
      encoder,
      decoder,
      provider,
      emitSynced,
      messageType
    ) => {
      // acquired lock
      const timestamp = decoding.readUint32(decoder);
      const lockRequest = this._currentLockRequest;
      this._currentLockRequest = null;
      if (lockRequest) {
        lockRequest.resolve(timestamp);
      }
    };
    // Message handler that receives the initial content
    this.messageHandlers[125] = (
      encoder,
      decoder,
      provider,
      emitSynced,
      messageType
    ) => {
      // received initial content
      const initialContent = decoding.readTailAsUint8Array(decoder);
      // Apply data from server
      if (initialContent.byteLength > 0) {
        setTimeout(() => {
          Y.applyUpdate(this.doc, initialContent);
        }, 0);
      }
      const initialContentRequest = this._initialContentRequest;
      this._initialContentRequest = null;
      if (initialContentRequest) {
        initialContentRequest.resolve(initialContent.byteLength > 0);
      }
    };
    this._isInitialized = false;
    this._onConnectionStatus = this._onConnectionStatus.bind(this);
    this.on('status', this._onConnectionStatus);
  }

  setPath(newPath: string): void {
    if (newPath !== this._path) {
      this._path = newPath;
      // The next time the provider connects, we should connect through a different server url
      this.bcChannel =
        this._serverUrl + '/' + this._contentType + ':' + this._path;
      this.url = this.bcChannel;
      const encoder = encoding.createEncoder();
      encoding.write(encoder, 123);
      // writing a utf8 string to the encoder
      const escapedPath = unescape(
        encodeURIComponent(this._contentType + ':' + newPath)
      );
      for (let i = 0; i < escapedPath.length; i++) {
        encoding.write(
          encoder,
          /** @type {number} */ escapedPath.codePointAt(i)!
        );
      }
      this._sendMessage(encoding.toUint8Array(encoder));
    }
  }

  /**
   * Resolves to true if the initial content has been initialized on the server. false otherwise.
   */
  requestInitialContent(): Promise<boolean> {
    if (this._initialContentRequest) {
      return this._initialContentRequest.promise;
    }

    let resolve: any, reject: any;
    const promise: Promise<boolean> = new Promise((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });
    this._initialContentRequest = { promise, resolve, reject };
    this._sendMessage(new Uint8Array([125]));

    // Resolve with true if the server doesn't respond for some reason.
    // In case of a connection problem, we don't want the user to re-initialize the window.
    // Instead wait for y-websocket to connect to the server.
    // @todo maybe we should reload instead..
    setTimeout(() => resolve(false), 1000);
    return promise;
  }

  /**
   * Put the initialized state.
   */
  putInitializedState(): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 124);
    encoding.writeUint8Array(encoder, Y.encodeStateAsUpdate(this.doc));
    this._sendMessage(encoding.toUint8Array(encoder));
    this._isInitialized = true;
  }

  /**
   * Acquire a lock.
   * Returns a Promise that resolves to the lock number.
   */
  acquireLock(): Promise<number> {
    if (this._currentLockRequest) {
      return this._currentLockRequest.promise;
    }
    this._sendMessage(new Uint8Array([127]));
    // try to acquire lock in regular interval
    const intervalID = setInterval(() => {
      if (this.wsconnected) {
        // try to acquire lock
        this._sendMessage(new Uint8Array([127]));
      }
    }, 500);
    let resolve: any, reject: any;
    const promise: Promise<number> = new Promise((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });
    this._currentLockRequest = { promise, resolve, reject };
    const _finally = () => {
      clearInterval(intervalID);
    };
    promise.then(_finally, _finally);
    return promise;
  }

  /**
   * Release a lock.
   *
   * @param lock The lock to release.
   */
  releaseLock(lock: number): void {
    const encoder = encoding.createEncoder();
    // reply with release lock
    encoding.writeVarUint(encoder, 126);
    encoding.writeUint32(encoder, lock);
    // releasing lock
    this._sendMessage(encoding.toUint8Array(encoder));
  }

  /**
   * Send a new message to WebSocket server.
   *
   * @param message The message to send
   */
  private _sendMessage(message: Uint8Array): void {
    // send once connected
    const send = () => {
      setTimeout(() => {
        if (this.wsconnected) {
          this.ws!.send(message);
        } else {
          this.once('status', send);
        }
      }, 0);
    };
    send();
  }

  /**
   * Handle a change to the connection status.
   *
   * @param status The connection status.
   */
  private async _onConnectionStatus(status: {
    status: 'connected' | 'disconnected';
  }): Promise<void> {
    if (this._isInitialized && status.status === 'connected') {
      const lock = await this.acquireLock();
      const contentIsInitialized = await this.requestInitialContent();
      if (!contentIsInitialized) {
        this.putInitializedState();
      }
      this.releaseLock(lock);
    }
  }

  private _path: string;
  private _contentType: string;
  private _serverUrl: string;
  private _isInitialized: boolean;
  private _currentLockRequest: {
    promise: Promise<number>;
    resolve: (lock: number) => void;
    reject: () => void;
  } | null = null;
  private _initialContentRequest: {
    promise: Promise<boolean>;
    resolve: (initialized: boolean) => void;
    reject: () => void;
  } | null = null;
}

/**
 * A namespace for WebSocketProviderWithLocks statics.
 */
export namespace WebSocketProviderWithLocks {
  /**
   * The instantiation options for a WebSocketProviderWithLocks.
   */
  export interface IOptions extends IDocumentProviderFactory.IOptions {
    /**
     * The server URL
     */
    url: string;

    /**
     * The state database
     */
    state: IStateDB | null;
  }
}
