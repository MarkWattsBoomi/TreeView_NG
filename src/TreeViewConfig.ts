import { _TreeView } from "./TreeView";

export class TreeViewConfig {
    fldItemId: string;
    fldParentId: string;
    fldSequence: string;
    fldTitle: string;
    fldDescription: string;
    fldStatus: string;
    fldCount: string;
    fldIcon: string;
    fldIsLocked: string;
    fldIsSelectable: string;

    constructor(tv: _TreeView) {
        this.fldItemId = tv.component.getAttribute('idProperty', 'ITEM_ID');
        this.fldParentId = tv.component.getAttribute('parentProperty', 'PARENT_ID');
        this.fldSequence = tv.component.getAttribute('sequenceProperty', 'SEQUENCE');
        this.fldTitle = tv.component.getAttribute('titleProperty', 'TITLE');
        this.fldDescription = tv.component.getAttribute('descriptionProperty', 'DESCRIPTION');
        this.fldStatus = tv.component.getAttribute('statusProperty', 'STATUS');
        this.fldCount = tv.component.getAttribute('countProperty', 'COUNT');
        this.fldIcon = tv.component.getAttribute('iconProperty', 'ICON');
        this.fldIsLocked = tv.component.getAttribute('lockedProperty', 'IS_LOCKED');
        this.fldIsSelectable = tv.component.getAttribute('selectableProperty', 'SELECTABLE_CHILDREN');
    }

}