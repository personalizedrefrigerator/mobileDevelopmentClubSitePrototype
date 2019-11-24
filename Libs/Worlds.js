"use strict";

/**
 *  A single part of a world. Each world object should
 * have model data that can be rendered (something registered
 * with the renderer), a method to get
 * that data, and an animation request handler. By default,
 * getModel is set to do THROW. It must be overridden.
 * The animate method, however, does nothing by default, as
 * not all objects must animate. The getTransform method,
 * by default, returns this.transformMat, which, at initialization
 * is set to the identity matrix.
 */
function WorldObject()
{
    const me = this;
    
    me.transformMat = new Mat44();
    me.transformMat.toIdentity(); // Select the identity, rather than the
                                  //zero matrix.
                                  
    me.textureCanvas = undefined;
    
    var registeredModel = undefined;
    
    // By default, throw. This method should return
    //refrences to models. This should be called only once.
    //Do not use this to generate dynamic models.
    this.getModel = () =>
    {
        throw "WorldObject.getModel is abstract and must be implemented.";
    };
    
    // Get the registered version of this object's model.
    this.getRegisteredModel = (renderer) => 
    {
        if (registeredModel == undefined)
        {
            me.registerModels(renderer);
        }
    
        return registeredModel;
    };
    
    // Intended for the registration of all models with the renderer.
    this.registerModels = (renderer) =>
    {
        registeredModel = renderer.registerObject();
        registeredModel.fromModel(this.getModel());
    };
    
    this.getTransform = () =>
    {
        return me.transformMat;
    };
    
    // The animate method takes a change in time and a renderer
    //The renderer provides useful context information and permits
    //the registration/unregistration of objects.
    this.animate = (renderer, deltaT) =>
    {
        // By default, do nothing. This is to
        //be overridden by clients who wish to
        //animate.
    };
    
    this.cleanup = () => {}; // Cleanup from an animate/render.
    
    // Render the world object. This method is intended
    //to be final, or if it is overridden, be called by
    //the method that overrides it.
    this.render = function(renderer)
    {
        // Save and restore the world matrix.
        renderer.worldMatrix.save();
        
        // TODO Test this for compliance with both left and
        //right multiplication matricies (e.g. do we need to
        //transpose?).
        renderer.worldMatrix.rightMulAndSet(me.getTransform());
        
        if (me.preRender)
        {
            me.preRender.call(me, renderer);
        }
        
        // Push the world matrix to WebGL.
        renderer.updateWorldMatrix();
        
        // Set textures.
        renderer.setTexture(me.textureCanvas || renderer.getOutputCanvas());
        
        // Bind the object.
        let model = me.getRegisteredModel(renderer);
        
        // Bind the objects buffers and render
        //it.
        model.bindBuffers();
        renderer.render(model);
        
        renderer.worldMatrix.restore();
    };
}

/**
 *      "A world in a box."
 * Construct a single, small world that can
 * coexist with other such worlds. This world
 * responds to ticks of the global clock and
 * shares a renderer with the full container.
 *
 * This is ideal for small, in-page animations,
 * like that of a spinning/squishable logo.
 */
function WorldBox()
{
    WorldObject.apply(this);            // Each WorldBox is considered
                                        //a box in the larger world.

    const me = this;
    
    this.objects = [];
    this.unregisteredObjects = [];
    this.destinationCtx = undefined;
    
    // When asked to register models,
    //simply do that for all sub-objects.
    this.registerModels = (renderer) =>
    {
        let lastObject;
        
        while (me.unregisteredObjects.length > 0)
        {
            lastObject = me.unregisteredObjects.pop();
            
            // Tell the object to register itself.
            lastObject.registerModels(renderer);
            
            // The last object is now registered.
            me.objects.push(lastObject);
        }
    };
    
    this.setDestinationCanvas = function(canvas)
    {
        me.destinationCtx = canvas.getContext("2d");
    };
    
    // Animate!
    //Pass this call to all sub-objects.
    this.animateChildren = function(renderer, deltaT)
    {
        // Register all unregistered objects.
        this.registerModels(renderer);
        
        // Animate all sub-objects.
        for (var i = 0; i < me.objects.length; i++)
        {
            me.objects[i].animate(renderer, deltaT);
        }
    };
    
    this.cleanupChildren = function()
    {
        for (var i = 0; i < me.objects.length; i++)
        {
            me.objects[i].cleanup();
        }
    };
    
    this.animate = this.animateChildren;
    
    this.cleanup = this.cleanupChildren;
    
    this.render = function(renderer)
    {
        var canvas = me.destinationCtx.canvas;
    
        // Update the renderer's size if necessary.
        renderer.updateViewIfNeeded(canvas.clientWidth,
                                       canvas.clientHeight,
                                       false); // Don't force.
        
        // Update the size of the rendering context if needed.
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight)
        {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }
        
        let currentObject;
        
        renderer.clear();
    
        renderer.saveUniforms();
        
        // If a function has been implemented that handles 
        //the application of renderer settings, call it.
        if (this.preRender)
        {
            this.preRender.call(me, renderer);
        }
        
        renderer.updateCamera();
        
        // Render every child object.
        for (let i = 0; i < me.objects.length; i++)
        {
            currentObject = me.objects[i];
            
            // Sub-objects might change uniforms.
            //Save and restore them.
            renderer.saveUniforms();
            
            if (!me.onRender)
            {
                currentObject.render(renderer);
            }
            else
            {
                me.onRender(currentObject, renderer);
            }
            
            renderer.restoreUniforms();
        }
        
        renderer.restoreUniforms();
        
        // Render to the destination context.
        renderer.display(me.destinationCtx);
    };
    
    this.addObject = function(newObject)
    {
        me.unregisteredObjects.push(newObject);
    };
    
    this.registerObject = this.addObject;
}

/**
 *  A full world is a collection of smaller, world boxes.
 * It manages the creation and update of such worlds.
 */
function FullWorld()
{
    const me = this;
    
    this.worlds = [];
    let stopLoop = false;
    this.renderer = RendererHelper.getRenderer();
    this.lastAnimateTime = (new Date()).getTime(); // TODO Check for potential bug when
                                                   // animate is called for the first time -- 
                                                   // if the user creates a FullWorld
                                                   // at program init, there could be a
                                                   // significant deltaT, messing things up. 
    
    this.registerWorld = function(world)
    {
        // Add the world.
        me.worlds.push(world);
    };
    
    this.animate = function()
    {
        const nowTime = (new Date()).getTime();
        const deltaT = nowTime - me.lastAnimateTime;
        
        for (let i = 0; i < me.worlds.length; i++)
        {
            me.worlds[i].animate(me.renderer, deltaT);
        }
        
        me.lastAnimateTime = nowTime;
    };
    
    this.render = function()
    {
        for (let i = 0; i < me.worlds.length; i++)
        {
            me.worlds[i].render(me.renderer);
        }
    };
    
    this.cleanup = function()
    {
        for (let i = 0; i < me.worlds.length; i++)
        {
            me.worlds[i].cleanup(me.renderer);
        }
    };
    
    this.loopOnce = function()
    {
        // Animate and render.
        me.animate();
        me.render();
        me.cleanup();
    };
    
    this.loop = function()
    {
        // If not to stop looping,
        if (!stopLoop)
        {
            me.loopOnce();
        
            requestAnimationFrame(() =>
            {
                me.loop.call(me);
            });
        } // Otherwise, we've stopped the loop.
        else
        {
            stopLoop = false;
        }
    };
    
    // Notes that we should stop looping.
    this.cancelLoop = function()
    {
        stopLoop = true;
    };
}

