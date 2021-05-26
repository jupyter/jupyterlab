// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ReactWidget } from '@jupyterlab/apputils';

import { caretDownEmptyIcon, searchIcon } from '@jupyterlab/ui-components';

import { ArrayExt } from '@lumino/algorithm';

import React, { useEffect, useState } from 'react';

import { DebugProtocol } from 'vscode-debugprotocol';

import { IDebugger } from '../../tokens';

import { VariablesModel } from './model';

import { convertType } from '.';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { CommandRegistry } from '@lumino/commands';
import { Debugger } from '../../debugger';

/**
 * The body for tree of variables.
 */
export class VariablesBodyTree extends ReactWidget {
  /**
   * Instantiate a new Body for the tree of variables.
   *
   * @param options The instantiation options for a VariablesBodyTree.
   */
  constructor(options: VariablesBodyTree.IOptions) {
    super();
    this._commands = options.commands;
    this._service = options.service;
    this._translator = options.translator;

    const model = options.model;
    model.changed.connect(this._updateScopes, this);

    this.addClass('jp-DebuggerVariables-body');
  }

  /**
   * Render the VariablesBodyTree.
   */
  render(): JSX.Element {
    const scope =
      this._scopes.find(scope => scope.name === this._scope) ?? this._scopes[0];

    return scope ? (
      <VariablesComponent
        key={scope.name}
        commands={this._commands}
        service={this._service}
        data={scope.variables}
        filter={this._filter}
        translator={this._translator}
        handleSelectVariable={variable => {
          this._latestSelection = variable;
        }}
      />
    ) : (
      <div></div>
    );
  }

  /**
   * Get the latest hit variable
   */
  get latestSelection(): IDebugger.IVariableSelection | null {
    return this._latestSelection;
  }

  /**
   * Set the variable filter list.
   */
  set filter(filter: Set<string>) {
    this._filter = filter;
    this.update();
  }

  /**
   * Set the current scope
   */
  set scope(scope: string) {
    this._scope = scope;
    this.update();
  }

  /**
   * Update the scopes and the tree of variables.
   *
   * @param model The variables model.
   */
  private _updateScopes(model: VariablesModel): void {
    if (ArrayExt.shallowEqual(this._scopes, model.scopes)) {
      return;
    }
    this._scopes = model.scopes;
    this.update();
  }

  private _commands: CommandRegistry;
  private _scope = '';
  private _scopes: IDebugger.IScope[] = [];
  private _filter = new Set<string>();
  private _latestSelection: IDebugger.IVariableSelection | null = null;
  private _service: IDebugger;
  private _translator: ITranslator | undefined;
}

interface IVariablesComponentProps {
  /**
   * The commands registry.
   */
  commands: CommandRegistry;
  data: IDebugger.IVariable[];
  service: IDebugger;
  filter?: Set<string>;
  /**
   * The application language translator
   */
  translator?: ITranslator;
  /**
   * Callback on variable selection
   */
  handleSelectVariable?: (variable: IDebugger.IVariable) => void;
}

/**
 * A React component to display a list of variables.
 *
 * @param {object} props The component props.
 * @param props.data An array of variables.
 * @param props.service The debugger service.
 * @param props.filter Optional variable filter list.
 */
const VariablesComponent = (props: IVariablesComponentProps): JSX.Element => {
  const {
    commands,
    data,
    service,
    filter,
    translator,
    handleSelectVariable
  } = props;
  const [variables, setVariables] = useState(data);

  useEffect(() => {
    setVariables(data);
  }, [data]);

  return (
    <ul>
      {variables
        ?.filter(
          variable => !(filter || new Set()).has(variable.evaluateName || '')
        )
        .map(variable => {
          const key = `${variable.name}-${variable.evaluateName}-${variable.type}-${variable.value}`;
          return (
            <VariableComponent
              key={key}
              commands={commands}
              data={variable}
              service={service}
              filter={filter}
              translator={translator}
              onSelect={handleSelectVariable}
            />
          );
        })}
    </ul>
  );
};

/**
 * VariableComponent properties
 */
interface IVariableComponentProps {
  /**
   * The commands registry.
   */
  commands: CommandRegistry;
  /**
   * Variable description
   */
  data: IDebugger.IVariable;
  /**
   * Filter applied on the variable list
   */
  filter?: Set<string>;
  /**
   * Debugger
   */
  service: IDebugger;
  /**
   * The application language translator
   */
  translator?: ITranslator;
  /**
   * Callback on selection
   */
  onSelect?: (variable: IDebugger.IVariable) => void;
}

/**
 * A React component to display one node variable in tree.
 *
 * @param {object} props The component props.
 * @param props.data An array of variables.
 * @param props.service The debugger service.
 * @param props.filter Optional variable filter list.
 */
const VariableComponent = (props: IVariableComponentProps): JSX.Element => {
  const { commands, data, service, filter, translator, onSelect } = props;
  const [variable] = useState(data);
  const [expanded, setExpanded] = useState<boolean>();
  const [variables, setVariables] = useState<DebugProtocol.Variable[]>();
  const styleName = {
    color: 'var(--jp-mirror-editor-attribute-color)'
  };

  const styleType = {
    color: 'var(--jp-mirror-editor-string-color)'
  };
  const onSelection = onSelect ?? (() => void 0);

  const expandable =
    variable.variablesReference !== 0 || variable.type === 'function';

  const trans = (translator ?? nullTranslator).load('jupyterlab');

  const onVariableClicked = async (e: React.MouseEvent): Promise<void> => {
    if (!expandable) {
      return;
    }
    e.stopPropagation();
    const variables = await service.inspectVariable(
      variable.variablesReference
    );
    setExpanded(!expanded);
    setVariables(variables);
  };

  return (
    <li
      onClick={(e): Promise<void> => onVariableClicked(e)}
      onMouseDown={() => {
        onSelection(variable);
      }}
    >
      <caretDownEmptyIcon.react
        visibility={expandable ? 'visible' : 'hidden'}
        stylesheet="menuItem"
        tag="span"
        transform={expanded ? 'rotate(0deg)' : 'rotate(-90deg)'}
      />
      <span style={styleName}>{variable.name}</span>
      <span>: </span>
      <span style={styleType}>{convertType(variable)}</span>
      <span className="jp-DebuggerVariables-hspacer"></span>
      <button
        className="jp-DebuggerVariables-renderVariable"
        disabled={
          !commands.isEnabled(Debugger.CommandIDs.renderMimeVariable, {
            name: variable.name,
            variablesReference: variable.variablesReference
          } as any)
        }
        onClick={e => {
          e.stopPropagation();
          onSelection(variable);
          commands
            .execute(Debugger.CommandIDs.renderMimeVariable, {
              name: variable.name,
              variablesReference: variable.variablesReference
            } as any)
            .catch(reason => {
              console.error(
                `Failed to render variable ${variable.name}`,
                reason
              );
            });
        }}
        title={trans.__('Render variable')}
      >
        <searchIcon.react stylesheet="menuItem" tag="span" />
      </button>

      {expanded && variables && (
        <VariablesComponent
          key={variable.name}
          commands={commands}
          data={variables}
          service={service}
          filter={filter}
          translator={translator}
        />
      )}
    </li>
  );
};

/**
 * A namespace for VariablesBodyTree `statics`.
 */
namespace VariablesBodyTree {
  /**
   * Instantiation options for `VariablesBodyTree`.
   */
  export interface IOptions {
    /**
     * The variables model.
     */
    model: IDebugger.Model.IVariables;
    /**
     * The debugger service.
     */
    service: IDebugger;
    /**
     * The commands registry.
     */
    commands: CommandRegistry;
    /**
     * The application language translator
     */
    translator?: ITranslator;
  }
}
