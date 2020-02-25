import React, { useState } from 'react';
import { copyIcon, undoIcon } from '@jupyterlab/ui-components';
import {
  ToolbarButtonComponent,
  Clipboard,
  ReactWidget
} from '@jupyterlab/apputils';

class EditWorkspaceDialogWidget extends ReactWidget {
  constructor(args: { value: string }) {
    super();
    this.value = args.value;
  }

  value: string = '';

  getValue() {
    return this.value;
  }

  render() {
    return (
      <EditWorkspaceDialog
        value={this.value}
        onChange={(value: string) => {
          this.value = value;
        }}
      />
    );
  }
}

const EditWorkspaceDialog = (props: {
  value: string;
  onChange: (val: string) => void;
}) => {
  const [value, setValue] = useState(props.value);
  return (
    <>
      <div className=".jp-Workspaces--list--item--editToolbar">
        <ToolbarButtonComponent
          icon={copyIcon}
          onClick={() => {
            Clipboard.copyToSystem(value);
          }}
        />
        <ToolbarButtonComponent
          icon={undoIcon}
          onClick={() => {
            const newVal = JSON.stringify({ ...JSON.parse(value), data: {} });
            props.onChange(newVal);
            setValue(newVal);
          }}
        />
      </div>
      <textarea
        rows={15}
        cols={500}
        value={value}
        onChange={evt => setValue(evt.target.value)}
        style={{ resize: 'none' }}
      ></textarea>
    </>
  );
};

export default EditWorkspaceDialogWidget;
