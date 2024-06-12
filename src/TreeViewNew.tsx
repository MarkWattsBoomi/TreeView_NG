import { FCMNew } from "fcmlib/lib/FCMNew";
import * as React from 'react';
import { _TreeView } from "./TreeView";

export default class TreeView extends FCMNew {

    //FCMCore will trigger this if we should update
    componentDidMount(): void {
        this.forceUpdate();
    }

    render() {
        return(
            <_TreeView 
                parent={this}
                ref={(element: any) => {this.childComponent = element}} // here we are giving FCMCore a ref to our component
            />
        );
    }
}