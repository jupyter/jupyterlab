// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { describe, galata, test } from '@jupyterlab/galata';
import { runMenuOpenTest, runSidebarOpenTest } from './util';

jest.setTimeout(60000);

describe('General Tests', () => {
  beforeAll(async () => {
    await galata.resetUI();
    galata.context.capturePrefix = 'general';
  });

  afterAll(async () => {
    galata.context.capturePrefix = '';
  });

  test('Launch Screen', async () => {
    const imageName = 'launch';
    await galata.capture.screenshot(imageName);
    expect(await galata.capture.compareScreenshot(imageName)).toBe('same');
  });

  runSidebarOpenTest();

  test('Enter Simple Mode', async () => {
    await galata.toggleSimpleMode(true);
    expect(await galata.isInSimpleMode()).toBeTruthy();

    const imageName = 'simple-mode';
    await galata.capture.screenshot(imageName);
    expect(await galata.capture.compareScreenshot(imageName)).toBe('same');
  });

  test('Leave Simple Mode', async () => {
    await galata.toggleSimpleMode(false);
    expect(await galata.isInSimpleMode()).toBeFalsy();
  });

  test('Toggle Dark theme', async () => {
    await galata.theme.setDarkTheme();
    const imageName = 'dark-theme';
    await galata.capture.screenshot(imageName);
    expect(await galata.capture.compareScreenshot(imageName)).toBe('same');
  });

  test('Toggle Light theme', async () => {
    await galata.theme.setLightTheme();
    await expect(galata.theme.getTheme()).resolves.toEqual('JupyterLab Light');
  });

  test('Move File Browser to right', async () => {
    await galata.sidebar.moveTabToRight('filebrowser');
    expect(await galata.sidebar.getTabPosition('filebrowser')).toBe('right');
  });

  test('Open File Browser on right', async () => {
    await galata.sidebar.openTab('filebrowser');
    expect(await galata.sidebar.isTabOpen('filebrowser')).toBeTruthy();
  });

  test('Close Sidebar on right', async () => {
    // await galata.sidebar.close('right'); // TODO To fix upstream
    await galata.menu.clickMenuItem('View>Appearance>Show Right Sidebar');
    expect(await galata.sidebar.isOpen('right')).toBeFalsy();
  });

  test('Open Sidebar on right', async () => {
    // await galata.sidebar.open('right'); // TODO To fix upstream
    await galata.menu.clickMenuItem('View>Appearance>Show Right Sidebar');
    expect(await galata.sidebar.isOpen('right')).toBeTruthy();
  });

  test('Capture File Browser on right', async () => {
    let imageName = 'filebrowser-right';
    await galata.capture.screenshot(imageName);
    expect(await galata.capture.compareScreenshot(imageName)).toBe('same');
  });

  test('Move File Browser to left', async () => {
    await galata.sidebar.moveTabToLeft('filebrowser');
    expect(await galata.sidebar.getTabPosition('filebrowser')).toBe('left');
  });

  test('Open File Browser on left', async () => {
    await galata.sidebar.openTab('filebrowser');
    expect(await galata.sidebar.isTabOpen('filebrowser')).toBeTruthy();
  });

  runMenuOpenTest();
});
