import React, { CSSProperties } from 'react';

import './TreeView.css';
import { FCMCore } from 'fcmlib/lib/FCMCore';
import { FlowObjectData } from 'fcmlib/lib/FlowObjectData';
import { TreeViewConfig } from './TreeViewConfig';
import TreeViewItem from './TreeViewItem';
import TreeViewNode from './TreeViewNode';
import { FCMContextMenu } from 'fcmkit/lib/ContextMenu/FCMContextMenu';
import { FCMModal } from 'fcmkit/lib/ModalDialog/FCMModal';
import { FlowObjectDataProperty } from 'fcmlib/lib/FlowObjectDataProperty';
import { eContentType } from 'fcmlib/lib/FCMNew';
import { FlowOutcome, ePageActionBindingType } from 'fcmlib/lib/FlowOutcome';
import Services from './Services';
import { FCMModalButton } from 'fcmkit/lib/ModalDialog/FCMModalButton';

export enum eDebugLevel {
    error = 0,
    warning = 1,
    info = 2,
    verbose = 3,
}

export class _TreeView extends React.Component<any,any> {

    version: string = '1.0.0';
    
    component: FCMCore;

    debugLevel: eDebugLevel = eDebugLevel.error;

    config: TreeViewConfig;

    selectedNodeId: number;
    nodeTree: Map<number, TreeViewItem>;
    nodeElementTree: any[];
    treeViewNodes: Map<number, TreeViewNode> = new Map();
    flatTree: Map<number, TreeViewItem> = new Map();

    draggedNode: number;

    contextMenu: FCMContextMenu;

    defaultExpanded: boolean = false;
    expansionPath: number[] = [];
    filterExpansionPath: number[] = [];

    matchingNodes: number[];

    searchBox: HTMLInputElement;

    maxResults: number = 30;
    absoluteMaxResults: number = 1000;

    messageBox: FCMModal;

    constructor(props: any) {
        super(props);
        this.component = this.props.parent;

        this.convertNode = this.convertNode.bind(this);
        this.doOutcome = this.doOutcome.bind(this);
        this.expand = this.expand.bind(this);
        this.collapse = this.collapse.bind(this);
        this.setNode = this.setNode.bind(this);
        this.showContextMenu = this.showContextMenu.bind(this);
        this.hideContextMenu = this.hideContextMenu.bind(this);
        this.showAll = this.showAll.bind(this);
        this.filterTree = this.filterTree.bind(this);
        this.filterTreeClear = this.filterTreeClear.bind(this);
        this.expandToSelected = this.expandToSelected.bind(this);
        this.expandToFilter = this.expandToFilter.bind(this);
        this.searchKeyEvent = this.searchKeyEvent.bind(this);
        this.drawResults = this.drawResults.bind(this);

        const dbl: number = parseInt(this.component.getAttribute('DebugLevel', '0'));
        this.debugLevel = dbl || eDebugLevel.error ;
        this.debug('Debug Level = ' + this.debugLevel, eDebugLevel.info);

        this.maxResults = parseInt(this.component.getAttribute('MaxSearchResults', '30'));
        this.absoluteMaxResults = parseInt(this.component.getAttribute('AbsoluteMaxSearchResults', '1000'));

        this.defaultExpanded = this.component.getAttribute('StartExpanded', 'false').toLowerCase() === 'true';

        this.config = new TreeViewConfig(this);
    }

    async componentDidMount() {
        await this.buildCoreTable();
        this.forceUpdate();
    }

    async componentUpdated(changeDetected: boolean) {
    }

    debug(message: string, debugLevel: eDebugLevel) {
        if (debugLevel.valueOf() <= this.debugLevel.valueOf()) {
            console.log(message);
        }
    }

    ///////////////////////////////////////////////////////////////////////////////////////////
    // reads the model
    // constructs the a flat a map of rows ready for searching, sorting and direct access
    // also builds the display column map
    ///////////////////////////////////////////////////////////////////////////////////////////
    async buildCoreTable() {
        if (this.component.getAttribute('apiEndpoint')) {
            this.buildTreeFromApi(this.component.getAttribute('apiEndpoint'), this.component.getAttribute('apiUser'), this.component.getAttribute('apiToken'));
        } else {
            this.buildTreeFromModel(this.component.objectData.items, 0);
        }
        this.refreshSelectedFromState();
    }

    async refreshSelectedFromState() {
        const start: number = new Date().getTime();
        const state: FlowObjectData = this.component.getStateValue() as FlowObjectData;
        this.selectedNodeId = undefined;
        if (state) {
            this.selectedNodeId = state.properties['ITEM_ID'].value as number;
        } else {
            // if no state then try clicked one
            if (this.component.getAttribute('ClickedState')) {
                const clickedState = await this.component.getValue(this.component.getAttribute('ClickedState'));
                this.selectedNodeId = (clickedState.value as FlowObjectData).properties['ITEM_ID'].value as number;
            }
        }
        this.expandToSelected();
        const tot: number = new Date().getTime() - start;
        this.debug('refreshSelectedFromState=' + (tot / 1000), eDebugLevel.error);
        this.forceUpdate();
    }

    setSearchBox(element: HTMLInputElement) {
        if (element) {
            this.searchBox = element;
            this.searchBox.addEventListener('keyup', this.searchKeyEvent);
        } else {
            if (this.searchBox) {
                this.searchBox.removeEventListener('keyup', this.searchKeyEvent);
            }
        }
    }

    searchKeyEvent(event: KeyboardEvent) {
        if (event.key.toLowerCase() === 'enter') {
            this.filterTree();
        }
    }

    setNode(key: number, element: TreeViewNode) {
        if (element) {
            this.treeViewNodes.set(key, element);
        } else {
            if (this.treeViewNodes.has(key)) {
                this.treeViewNodes.delete(key);
            }
        }
    }

    getNode(key: number): TreeViewNode {
        return this.treeViewNodes.get(key);
    }

    convertNode(source: FlowObjectData): FlowObjectData {
        let result: FlowObjectData;
        if (this.component.objectData.items && this.component.objectData.items.length > 0) {
            const targettype: string = this.component.objectData.items[0].developerName;
            result = FlowObjectData.newInstance(targettype);
            Object.keys(source.properties).forEach((key: string) => {
                let prop: FlowObjectDataProperty = source.properties[key];
                if (prop.contentType !== eContentType.ContentObject && prop.contentType !== eContentType.ContentList) {
                    result.addProperty(FlowObjectDataProperty.newInstance(prop.developerName, prop.contentType, prop.value as string));
                }
            });
        }
        return result;
    }

    async doOutcome(outcomeName: string, node: TreeViewItem) {
        if (outcomeName === 'OnSelect' ||
            (this.component.outcomes[outcomeName]?.pageActionBindingType !== ePageActionBindingType.NoSave
                && node)) {
            // if selectable then set state value otherwise clear it
            if (node.isSelectable() === true) {
                this.component.setStateValue(node.objectData);
            } else {
                this.component.setStateValue(undefined);
            }

            // if there's a clicked state attribute then set it
            if (this.component.getAttribute('ClickedState')) {
                const clickedState = await this.component.getValue(this.component.getAttribute('ClickedState'));
                clickedState.value = node.objectData;
                await this.component.setValues(clickedState);
            }

            this.selectedNodeId = node.itemId;
        }

        if (this.component.outcomes[outcomeName]) {
            this.component.triggerOutcome(outcomeName);
        } 

        this.expandToSelected();
        this.expandToFilter();
        this.treeViewNodes.forEach((node: TreeViewNode) => {
            node.forceUpdate();
        });
        this.forceUpdate();
    }

    async expand() {
        console.log('expand');
        this.treeViewNodes.forEach((node: TreeViewNode) => {
            node.expanded = true;
            node.forceUpdate();
        });
    }

    async collapse() {
        console.log('collapse');
        this.treeViewNodes.forEach((node: TreeViewNode) => {
            node.expanded = false;
            node.forceUpdate();
        });
    }

    // adds the parent path for the selected node
    expandToSelected() {
        this.expansionPath = [];
        if (this.selectedNodeId) {
            // get the lowest item from nodeTree
            let nodeItem: TreeViewItem = this.flatTree.get(this.selectedNodeId);
            const topParent: number = nodeItem.itemId;
            while (nodeItem) {
                nodeItem = this.flatTree.get(nodeItem.parentItemId);
                if (nodeItem) {
                    this.expansionPath = this.expansionPath.concat(nodeItem.itemId);
                    this.expansionPath = this.expansionPath.filter((item, pos) => this.expansionPath.indexOf(item) === pos);
                }
            }
        }
    }

    expandToFilter() {
        this.filterExpansionPath = [];

        this.matchingNodes?.forEach((nodeId: number) => {
            let nodeItem: TreeViewItem = this.flatTree.get(nodeId);
            const topParent: number = nodeItem.itemId;
            while (nodeItem) {
                nodeItem = this.flatTree.get(nodeItem.parentItemId);
                if (nodeItem) {
                    this.filterExpansionPath = this.filterExpansionPath.concat(nodeItem.itemId);
                    this.filterExpansionPath = this.filterExpansionPath.filter((item, pos) => this.filterExpansionPath.indexOf(item) === pos);
                }
            }
        });
    }

    onDrag(e: any, nodeId: number) {
        console.log('drag ' + nodeId);
        e.stopPropagation();
        const srcNode = e.currentTarget.getAttribute('data-node');
        if (srcNode) {
            e.dataTransfer.effectAllowed = 'all';
            e.dataTransfer.setData('node', nodeId);
            this.draggedNode = nodeId;
        } else {
            e.dataTransfer.effectAllowed = 'none';
            this.draggedNode = undefined;
        }
    }

    isPermissableTargetQueue(movingNode: number, potentialParentNode: number): boolean {
        if (movingNode === potentialParentNode) {
            return false;
        }
        if (this.isChildOf(potentialParentNode, movingNode)) {
            return false;
        }
        if (this.isParentOf(potentialParentNode, movingNode)) {
            return false;
        }
        return true;
    }

    isChildOf(potentialParentNode: number, movingNode: number): boolean {
        return this.treeViewNodes.get(movingNode).props.parentId === potentialParentNode;
    }

    isParentOf(potentialParentNode: number, movingNode: number): boolean {
        return this.treeViewNodes.get(potentialParentNode).props.parentId === movingNode;
    }

    onDragEnter(e: any) {
        e.preventDefault();
        e.stopPropagation();
    }

    onDragLeave(e: any) {
        e.preventDefault();
        e.stopPropagation();
        const queue = e.currentTarget.getAttribute('data-node');
        e.currentTarget.classList.remove('can-drop');
        e.currentTarget.classList.remove('cannot-drop');
    }

    onDragOver(e: any) {
        e.preventDefault();
        e.stopPropagation();
        const potentialParent: number  = e.currentTarget.getAttribute('data-node');
        const permissableTarget: boolean = this.isPermissableTargetQueue(this.draggedNode, potentialParent);
        if (!permissableTarget) {
            e.dataTransfer.dropEffect = 'none';
            e.currentTarget.classList.add('cannot-drop');
        } else {
            e.dataTransfer.dropEffect = 'move';
            e.currentTarget.classList.add('can-drop');
        }
    }

    async onDrop(e: any) {
        const srcNode = e.dataTransfer.getData('node');
        const tgtNode = e.currentTarget.getAttribute('data-node');

        e.preventDefault();
        e.stopPropagation();

        this.draggedNode = undefined;
        e.dataTransfer.clearData();
        e.currentTarget.classList.remove('can-drop');
        e.currentTarget.classList.remove('cannot-drop');

        if (srcNode &&  srcNode !== tgtNode) {
            await this.moveNode(srcNode, tgtNode);
            this.forceUpdate();
        }

    }

    async moveNode(srcNode: string, targetNode: string) {
        console.log('move ' + srcNode + ' into ' + targetNode);
    }

    buildHeaderButtons(): any[] {
        const content: any = [];

        const lastOrder: number = 0;
        let addedExpand: boolean = false;
        let addedContract: boolean = false;
        Object.keys(this.component.outcomes).forEach((key: string) => {
            const outcome: FlowOutcome = this.component.outcomes[key];
            if (outcome.order > 10 && addedExpand === false) {
                content.push(
                    <span
                        key="EXPAND"
                        className={'glyphicon glyphicon-plus treeview-header-button'}
                        title={'Expand All'}
                        onClick={this.expand}
                    />,
                );
                addedExpand = true;
            }
            if (outcome.order > 20 && addedContract === false) {
                content.push(
                    <span
                        key="CONTRACT"
                        className={'glyphicon glyphicon-minus treeview-header-button'}
                        title={'Collapse All'}
                        onClick={this.collapse}
                    />,
                );
                addedContract = true;
            }
            if (outcome.isBulkAction && outcome.developerName !== 'OnSelect' && !outcome.developerName.toLowerCase().startsWith('cm')) {
                content.push(
                    <span
                        key={key}
                        className={'glyphicon glyphicon-' + (outcome.attributes['icon']?.value || 'plus') + ' treeview-header-button'}
                        title={outcome.label || key}
                        onClick={(e: any) => {this.doOutcome(key, undefined); }}
                    />,
                );
            }
        });
        if (addedExpand === false) {
            content.push(
                <span
                    key="EXPAND"
                    className={'glyphicon glyphicon-plus treeview-header-button'}
                    title={'Expand Next Level'}
                    onClick={this.expand}
                />,
            );
            addedExpand = true;
        }
        if (addedContract === false) {
            content.push(
                <span
                    key="CONTRACT"
                    className={'glyphicon glyphicon-minus treeview-header-button'}
                    title={'Collapse All'}
                    onClick={this.collapse}
                />,
            );
            addedContract = true;
        }
        return content;
    }

    flatTreeFind(itemId: number): TreeViewItem | undefined {
        if (this.flatTree.has(itemId)) {
            return this.flatTree.get(itemId);
        } else {
            for (const key of Array.from(this.flatTree.keys())) {
                const parent: TreeViewItem = this.flatTreeFindChildren(this.flatTree.get(key).children, itemId);
                if (parent) {
                    return parent;
                }
            }
            return undefined;
        }
    }

    flatTreeFindChildren(children: Map<number, TreeViewItem>, itemId: number): TreeViewItem | undefined {
        if (children.has(itemId)) {
            return children.get(itemId);
        } else {
            for (const key of Array.from(children.keys())) {
                const parent: TreeViewItem = this.flatTreeFindChildren(children.get(key).children, itemId);
                if (parent) {
                    return parent;
                }
            }
            return undefined;
        }
    }

    ///////////////////////////////////////////////////////////////////////////////////////////
    // constructs the nodeTree and a flat a map of TreeViewItems from the model datasource data
    ///////////////////////////////////////////////////////////////////////////////////////////
    buildTreeFromModel(items: FlowObjectData[], level: number) {
        this.nodeTree = new Map();
        this.flatTree = new Map();
        const start: number = new Date().getTime();
        items.forEach((item: FlowObjectData) => {
            const tvi: TreeViewItem = TreeViewItem.fromObjectData(this.config, item);
            this.flatTree.set(tvi.itemId, tvi);
        });

        this.flatTree = new Map(Array.from(this.flatTree).sort((a: any, b: any) => {
            switch (true) {
                case a[1].itemName > b[1].itemName:
                    return 1;
                case a[1].itemName === b[1].itemName:
                    return 0;
                default:
                    return -1;

            }
        }));

        this.flatTree.forEach((item: TreeViewItem) => {

            const parent = this.flatTreeFind(item.parentItemId); // this.flatTree.get(item.parentItemId);
            if (parent) {
                item.setItemLevel(parent.itemLevel + 1);
                parent.children.set(item.itemId, item);
            } else {
                // my parent isn't in tree yet, just add me at root
                item.setItemLevel(level);
                this.nodeTree.set(item.itemId, item);
            }
        });

        // now all items are in tree re-iterate looking for parents
        this.nodeTree.forEach((topLevel: TreeViewItem) => {
            // we wont do this if the top level has a 0 or -1 parent id or the parent id= itme id
            const parent = this.flatTree.get(topLevel.parentItemId);
            if (parent && !(parent.itemId === topLevel.itemId)) {
                topLevel.setItemLevel(parent.itemLevel + 1);
                parent.children.set(topLevel.itemId, topLevel);
                this.nodeTree.delete(topLevel.itemId);
            }
        });

        // now tree is completely built, re-iterate sorting
        this.nodeTree.forEach((topLevel: TreeViewItem) => {
            this.sortTreeNodeChildren(topLevel, false);
        });

        this.nodeElementTree = this.buildTree(this.nodeTree);

        const tot: number = new Date().getTime() - start;
        this.debug('buildTreeFromModel=' + (tot / 1000), eDebugLevel.error);

    }

    async buildTreeFromApi(endpoint: string, user: string, token: string) {

        const items: TreeViewItem[] = await Services.getHierarchyItems(this.config, endpoint, user, token);
        this.nodeTree = new Map();
        this.flatTree = new Map();
        const start: number = new Date().getTime();
        items.forEach((item: TreeViewItem) => {
             // add to flat tree for easy searching
            this.flatTree.set(item.itemId, item);
        });

        this.flatTree = new Map(Array.from(this.flatTree).sort((a: any, b: any) => {
            switch (true) {
                case a[1].itemName > b[1].itemName:
                    return 1;
                case a[1].itemName === b[1].itemName:
                    return 0;
                default:
                    return -1;

            }
        }));

        this.flatTree.forEach((item: TreeViewItem) => {

            const parent = this.flatTreeFind(item.parentItemId); // this.flatTree.get(item.parentItemId);
            if (parent) {
                item.setItemLevel(parent.itemLevel + 1);
                parent.children.set(item.itemId, item);
            } else {
                // my parent isn't in tree yet, just add me at root
                item.setItemLevel(0);
                this.nodeTree.set(item.itemId, item);
            }
        });

        // now all items are in tree re-iterate looking for parents
        this.nodeTree.forEach((topLevel: TreeViewItem) => {
            // we wont do this if the top level has a 0 or -1 parent id or the parent id= itme id
            const parent = this.flatTree.get(topLevel.parentItemId);
            if (parent && !(parent.itemId === topLevel.itemId)) {
                topLevel.setItemLevel(parent.itemLevel + 1);
                parent.children.set(topLevel.itemId, topLevel);
                this.nodeTree.delete(topLevel.itemId);
            }
        });

        // now tree is completely built, re-iterate sorting
        this.nodeTree.forEach((topLevel: TreeViewItem) => {
            this.sortTreeNodeChildren(topLevel, false);
        });

        this.nodeElementTree = this.buildTree(this.nodeTree);

        const tot: number = new Date().getTime() - start;
        this.debug('buildTreeFromJSON=' + (tot / 1000), eDebugLevel.error);
        this.forceUpdate();

    }

    sortTreeNodeChildren(node: TreeViewItem, descending?: boolean) {
        if (node.children.size > 0) {
            node.children = new Map(Array.from(node.children).sort((a: any, b: any) => {
                if (descending && descending === true) {
                    switch (true) {
                        case a[1].itemName > b[1].itemName:
                            return -1;
                        case a[1].itemName === b[1].itemName:
                            return 0;
                        default:
                            return 1;
                    }
                } else {
                    switch (true) {
                        case a[1].itemName > b[1].itemName:
                            return 1;
                        case a[1].itemName === b[1].itemName:
                            return 0;
                        default:
                            return -1;
                    }
                }
            }));
            node.children.forEach((child: TreeViewItem) => {
                this.sortTreeNodeChildren(child);
            });

        }
    }

    //////////////////////////////////////////////////////////////
    // Constructs a react component tree from the TreeViewItem map
    //////////////////////////////////////////////////////////////
    buildTree(nodes: Map<number, TreeViewItem>): any[] {
        const start: number = new Date().getTime();
        // this.expandToSelected();
        // this.expandToFilter();
        const elements: any[] = [];
        if (nodes) {
            nodes.forEach((node: TreeViewItem) => {
                const children: any[] = this.buildTree(node.children);
                const expanded: boolean = this.defaultExpanded;
                // if(this.expansionPath.indexOf(node.itemId)>=0 || this.filterExpansionPath.indexOf(node.itemId)>=0){
                //    expanded=true;
                // }
                elements.push(
                    <TreeViewNode
                        key={node.itemId}
                        root={this}
                        nodeId={node.itemId}
                        parentId={node.parentId}
                        children={children}
                        expanded={expanded}
                        allowRearrange={this.component.isEditable}
                        ref={(element: TreeViewNode) => {this.setNode(node.itemId , element); }}

                    />,
                );
            });
        }

        const tot: number = new Date().getTime() - start;
        // this.debug("buildTree=" + (tot/1000),eDebugLevel.error);
        return elements;
    }

    showAll(e: any) {
        this.messageBox.hideDialog();
        this.filterTree(true);
    }

    noResults() {
        this.drawResults();
    }

    maxExceeded() {
        const tot: number = this.matchingNodes.length;
        this.matchingNodes = this.matchingNodes.slice(0, this.maxResults);
        this.messageBox.showDialog(
            null,
            'High Result Count Warning',
            (<div>
                <span>{'Your search returned a large number of matches and could impact performance'}</span>
                <br/>
                <br/>
                <span>{'By default only the first ' + this.maxResults + ' of a possible ' + tot + ' will be displayed'}</span>
                <br/>
                <br/>
                <span>{'Do you want to see all the results ?'}</span>
                <br/>
                <span>{'(This may take some time)'}</span>
            </div>),
            [new FCMModalButton('Show All', this.showAll), new FCMModalButton('Show Default', this.drawResults)],
        );
    }

    absoluteMaxExceeded() {
        const tot: number = this.matchingNodes.length;
        this.matchingNodes = this.matchingNodes.slice(0, this.absoluteMaxResults);
        this.messageBox.showDialog(
            null,
            'Extreme High Result Count Warning',
            (<div>
                <span>{'Your search returned more than ' + this.absoluteMaxResults + ' matches and will impact performance'}</span>
                <br/>
                <br/>
                <span>{'The results have been truncated'}</span>
                <br/>
                <br/>
            </div>),
            [new FCMModalButton('Ok', this.drawResults)],
        );
    }

    filterTree(showAll: boolean = false) {

        const criteria: string = this.searchBox?.value;
        if (criteria?.length > 0) {
            if (criteria.length < 3) {
                const content: any = (
                    <span>Searching with less than 3 characters is not permitted.</span>
                );
                this.matchingNodes = undefined;
                this.messageBox.showDialog(
                    null,
                    'Search Criteria Restriction', 
                    content, 
                    [new FCMModalButton('Ok', this.messageBox.hideDialog)]
                );
            } else {
                this.matchingNodes = [];
                // traverse all nodes
                this.flatTree.forEach((node: TreeViewItem) => {
                    if (
                        (node.itemName?.toLowerCase().indexOf(criteria?.toLowerCase()) >= 0 ||
                        node.itemDescription?.toLowerCase().indexOf(criteria?.toLowerCase()) >= 0)
                    ) {
                        this.matchingNodes.push(node.itemId);
                        // this.matchingNodes = this.matchingNodes.concat(node.itemId);
                        // this.matchingNodes = this.matchingNodes.filter((item, pos) => this.matchingNodes.indexOf(item) === pos);
                    }
                });

                switch (true) {

                    // over abs max.  truncate and warn
                    case this.matchingNodes.length >= this.absoluteMaxResults:
                        this.absoluteMaxExceeded();
                        break;

                    case this.matchingNodes.length >= this.maxResults && showAll === true:
                        this.drawResults();
                        break;

                    case this.matchingNodes.length >= this.maxResults && showAll === false:
                        this.maxExceeded();
                        break;

                    case this.matchingNodes.length === 0:
                        this.messageBox.showDialog(
                            null,
                            'No Results',
                            (<span>{'The search returned no matches, please refine your search and try again.'}</span>),
                            [new FCMModalButton('Ok', this.messageBox.hideDialog)],
                        );
                        this.searchBox.value = '';
                        break;
                    default:
                        this.drawResults();
                        break;
                }
            }
        } else {
            this.matchingNodes = undefined;
            this.drawResults();
        }
    }

    drawResults() {
        this.messageBox.hideDialog();
        this.buildTree(this.nodeTree);
        this.expandToSelected();
        this.expandToFilter();
        this.treeViewNodes.forEach((node: TreeViewNode) => {
            node.forceUpdate();
        });
        this.forceUpdate();
    }

    filterTreeClear() {
        this.searchBox.value = '';
        this.filterTree();
    }

    showContextMenu(e: any) {
        e.preventDefault();
        e.stopPropagation();
        const listItems: Map<string , any> = new Map();
        if (this.contextMenu) {
            Object.keys(this.component.outcomes).forEach((key: string) => {
                const outcome: FlowOutcome = this.component.outcomes[key];
                if (outcome.isBulkAction === true && outcome.developerName !== 'OnSelect' && outcome.developerName.toLowerCase().startsWith('cm')) {
                    listItems.set(outcome.developerName, (
                        <li
                            className="cm-item"
                            title={outcome.label || key}
                            onClick={(e: any) => {e.stopPropagation(); this.doOutcome(key, undefined); }}
                        >
                            <span
                                className={'glyphicon glyphicon-' + (outcome.attributes['icon']?.value || 'plus') + ' cm-item-icon'} />
                            <span
                                className={'cm-item-label'}
                            >
                                {outcome.label || key}
                            </span>
                        </li>
                    ));
                }
            });
            this.contextMenu.showContextMenu(e.clientX, e.clientY, listItems);
            this.forceUpdate();
        }
    }

    async hideContextMenu() {
        this.contextMenu.hideContextMenu();
    }


    
    render() {
        
        // handle classes attribute and hidden and size
        this.debug('render', eDebugLevel.error);

        // handle classes attribute and hidden and size
        const classes: string = 'treeview ' + this.component.getAttribute('classes', '');

        const style: CSSProperties = {};
        style.width = '-webkit-fill-available';
        style.height = '-webkit-fill-available';

        if (this.component.isVisible === false) {
            style.display = 'none';
        }
        if (this.component.getAttribute("width")) {
            style.width = this.component.getAttribute("width");
        }
        if (this.component.getAttribute("height")) {
            style.height = this.component.getAttribute("height");
        }

        const title: string = this.component.label || '';
        
        const headerButtons: any[] = [];//this.buildHeaderButtons();

        let search: any;
        if(this.component.isSearchable) {
            search = (
                <div
                    className="treeview-header-search"
                >
                    <input
                        className="treeview-header-search-input"
                        ref={(element: HTMLInputElement) => {this.setSearchBox(element); }}
                    />
                    <span
                        className={'glyphicon glyphicon-search treeview-header-search-button'}
                        onClick={(e: any) => {this.filterTree(false); }}
                    />
                    <span
                        className={'glyphicon glyphicon-remove treeview-header-search-button'}
                        onClick={this.filterTreeClear}
                    />

                </div>
            );
        }

        return (
            <div
                className={classes}
                style={style}
                onContextMenu={this.showContextMenu}
            >
                <FCMContextMenu
                    parent={this}
                    ref={(element: FCMContextMenu) => {this.contextMenu = element; }}
                />
                <FCMModal
                    parent={this}
                    ref={(element: FCMModal) => {this.messageBox = element; }}
                />
                <div
                    className="treeview-header"
                >
                    <div
                        className="treeview-header-title-wrapper"
                    >
                        <span
                            className="treeview-header-title"
                        >
                            {title}
                        </span>
                    </div>
                    {search}
                    <div
                        className="treeview-header-buttons"
                    >
                        {headerButtons}
                    </div>
                </div>
                <div
                    className="treeview-scroller"
                >
                    <div
                        className="treeview-body"
                    >
                        {this.nodeElementTree}
                    </div>
                </div>
            </div>
        );
    }

}

