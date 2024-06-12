import { FCMLegacy } from "fcmlib/lib/FCMLegacy";
import * as React from 'react';
import { _TreeView } from "./TreeView";
declare const manywho: any;

class TreeView extends FCMLegacy {

    //FCMCore will trigger this if we should update
    componentDidMount() {
        if(this.childComponent && this.childComponent.componentDidMount){
            this.childComponent.componentDidMount();
        }
    }

    //FCMCore will trigger this when it gets updated props
    // if it definitely thinks we should update you'll get a true arg.
    componentUpdated(changeDetected: boolean){
        // you can perform specific logic here to decide if you want to trigger the component to update
        if(this.childComponent && this.childComponent.componentUpdated){
            this.childComponent.componentUpdated();
        }
    }

    render() {
        return(
            <_TreeView 
                key={this.id}
                parent={this}
                ref={(element: any) => {this.childComponent = element}} // here we are giving FCMCore a ref to our component
            />
        );
    }
}
manywho.component.register('TreeView', TreeView);