"use strict";

function LogoBulb()
{
    const me = this;
    WorldObject.apply(me);
    
    this.textureCanvas = document.createElement("canvas");
    this.textureCtx = this.textureCanvas.getContext("2d");
    
    me.textureCtx.fillStyle = "gray";
    me.textureCtx.fillRect(0, 0, me.textureCtx.canvas.width,
                                 me.textureCtx.canvas.height);
    me.transformMat.scale(4, 3, 4);
    
    this.getModel = function()
    {
        return ModelHelper.Objects.get("Bulb", "Cube");
    };
    
    this.animate = function(renderer, deltaT)
    {
        // Nothing for now.
    };
    
    this.preRender = function(renderer)
    {
        renderer.setShine(1000);
        renderer.setTint(new Vector3(0.5, 0.5, 0.5));
    };
}

function LogoInner()
{
    const me = this;
    WorldObject.apply(me);
    
    this.textureCanvas = document.createElement("canvas");
    this.textureCtx = this.textureCanvas.getContext("2d");
    
    me.textureCtx.fillStyle = "orange";
    me.textureCtx.fillRect(0, 0, me.textureCtx.canvas.width, me.textureCtx.canvas.height);
    
    me.textureCtx.fillStyle = "white";
    me.textureCtx.font = "bold 12em Serif";
    me.textureCtx.textAlign = "left";
    me.textureCtx.textBaseline = "alphabetic";
    me.textureCtx.fillText("<:>", 0, me.textureCtx.canvas.height / 2);
    
    me.transformMat.translate([-50, -125, 50]);
    me.transformMat.scale(2, 3, 2);
    
    this.getModel = function()
    {
        // For now, just return a cube.
        return ModelHelper.Objects.get("Cube");
    };
    
    this.animate = function(renderer, deltaT)
    {
        // Nothing for now.
    };
    
    this.preRender = function(renderer)
    {
        renderer.setShine(10000);
        renderer.setTint(new Vector3(0.0, 0.0, 0.0));
    };
}

function LogoWorld()
{
    const me = this;
    WorldBox.apply(me);
    
    let firstBulb = new LogoBulb();
    let secondBulb = new LogoBulb();
    let innerLogo = new LogoInner();
    
    this.registerObject(firstBulb);
    this.registerObject(secondBulb);
    this.registerObject(innerLogo);
    
    this.preRender = function(renderer)
    {
        renderer.setFogColor(new Vector3(1.0, 1.0, 1.0));
        renderer.setZMax(2000);
        
        renderer.setTint(new Vector3(0.5, 0.5, 0.5));
        
        renderer.setLightPosition(new Vector3(-400.0, 100.0, 700.0));
    };
    
    this.animate = (renderer, deltaT) =>
    {
        this.animateChildren(renderer, deltaT);
        
        let time = (new Date()).getTime();
        
        firstBulb.transformMat.save();
        secondBulb.transformMat.save();
        
        let rotationAmount = Math.pow(Math.tan(time / 120000) * Math.max(0.3, Math.abs(Math.tan(time / 100000))), 3);
        
        firstBulb.transformMat.rotateY(Math.PI * 0.9 + rotationAmount * Math.PI / 2);
        secondBulb.transformMat.rotateY(Math.PI * 5/6 - rotationAmount * Math.PI / 2);
        secondBulb.transformMat.rotateZ(Math.abs(Math.sin(rotationAmount)) * Math.PI / 32);
        firstBulb.transformMat.rotateZ(-Math.pow(Math.sin(rotationAmount * 32), 2) * Math.PI / 16);
        
        firstBulb.transformMat.translate([0, 100, 40]);
        secondBulb.transformMat.translate([Math.sin(time / 500), 100, 38]);
    };
    
    this.cleanup = () =>
    {
        firstBulb.transformMat.restore();
        secondBulb.transformMat.restore();
    };
}

async function registerLogoObjects()
{
    const SILHOUETTE_DIVISIONS = 30,
          NORMALS_TOLERANCE = 0.6,
          REVOLUTION_DIVISIONS = 20;
          
    // Push logo generation to the background.
    const thread = ThreadHelper.makeLibLinkedThread();
    
    // Put the logo generation tasks.
    const generateVerticies = (silhouetteDivisions, revolveDivisions) =>
    new Promise((resolve, reject) =>
    {
        const SCALE = 15;
        let maxI = 7;
        let socketLen = 0.5;
        
        let silhouette = [];
        let point;
        let stretchedI;
        
        silhouette.push(new Point(0, 0));
        
        for (var i = -socketLen; i <= maxI; i += maxI / silhouetteDivisions)
        {
            stretchedI = i < maxI / 3 ? i / (i + 1) : i;
            
            if (i > maxI * 1 / 8)
            {
                point = new Point(
                    SCALE * (Math.tan(i / maxI * Math.PI / 4) + 1) * Math.sqrt(4 - (stretchedI - 1) * (stretchedI - 2) / (stretchedI + 0.5)),
                    -i * SCALE);
            }
            else
            {
                point = new Point(SCALE * 1.5, -i * SCALE);
            }
            
            silhouette.push(point);
        }
        
        let verticies = ModelHelper.silhouetteToVerticies
        (
            silhouette,
            0,      // Start angle,
            Math.PI * 4 / 3, // end angle.
            revolveDivisions
        );
        
        resolve(verticies);
    });
    
    const generateNormals = (verticies, normalsTolerance) =>
    new Promise((resolve, reject) =>
    {
        let normals = ModelHelper.computeNormals(verticies, normalsTolerance);
        
        resolve(normals);
    });
    
    // Put the tasks.
    thread.putFunction("generateVerticies", ["silhouetteDivisions", "revolveDivisions"], generateVerticies);
    thread.putFunction("generateNormals", ["verticies", "normalsTolerance"], generateNormals);
    
    thread.compile();
    
    // Call them.
    let verticies = await thread.callFunction("generateVerticies", 
            [SILHOUETTE_DIVISIONS, REVOLUTION_DIVISIONS]);
    let normals = await thread.callFunction("generateNormals", [verticies, NORMALS_TOLERANCE]);
    
    ModelHelper.Objects.register("Bulb",
        verticies, normals, undefined, undefined,
        JSHelper.getArrayOfRandomColors(verticies.length,
            false, // No rounding.
            3, // 3 components
            0.4, 0.4, // Min maxes.
            0.4, 0.4,
            0.5, 0.6
            )
    );
    
    // This is an async function, so it returns a promise.
    return true;
}

function loadLogos(worldManager)
{
    // First, register logo-associated objects.
    registerLogoObjects().then(() =>
    {
        let allLogos = document.getElementsByClassName("logo");
        let currentLogo, subWorld;
        
        for (var i = 0; i < allLogos.length; i++)
        {
            currentLogo = allLogos[i];
            subWorld = new LogoWorld();
            
            // All logos should also be canvases.
            subWorld.setDestinationCanvas(currentLogo);
            
            // Register the world.
            worldManager.registerWorld(subWorld);
            
            // Fade the logo in.
            currentLogo.style.animation = "1s ease fadeIn";
        }
    });
}

function main()
{
    const worldManager = new FullWorld();
    
    // Load all logos.
    loadLogos(worldManager);
    
    // Run!
    worldManager.loop();
}

// Call main in the next frame.
requestAnimationFrame(main);
