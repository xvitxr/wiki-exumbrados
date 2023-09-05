/*!
 * VisualEditor ContentEditable MWTransclusionNode class.
 *
 * @copyright 2011-2020 VisualEditor Team and others; see AUTHORS.txt
 * @license The MIT License (MIT); see LICENSE.txt
 */

/**
 * ContentEditable MediaWiki transclusion node.
 *
 * @class
 * @abstract
 * @extends ve.ce.LeafNode
 * @mixins ve.ce.GeneratedContentNode
 * @mixins ve.ce.FocusableNode
 *
 * @constructor
 * @param {ve.dm.MWTransclusionNode} model Model to observe
 * @param {Object} [config] Configuration options
 */
ve.ce.MWTransclusionNode = function VeCeMWTransclusionNode( model, config ) {
	// Parent constructor
	ve.ce.MWTransclusionNode.super.call( this, model, config );

	// Mixin constructors
	ve.ce.GeneratedContentNode.call( this );
	ve.ce.FocusableNode.call( this );
};

/* Inheritance */

OO.inheritClass( ve.ce.MWTransclusionNode, ve.ce.LeafNode );

OO.mixinClass( ve.ce.MWTransclusionNode, ve.ce.GeneratedContentNode );
OO.mixinClass( ve.ce.MWTransclusionNode, ve.ce.FocusableNode );

/* Static Properties */

ve.ce.MWTransclusionNode.static.name = 'mwTransclusion';

ve.ce.MWTransclusionNode.static.primaryCommandName = 'transclusion';

ve.ce.MWTransclusionNode.static.iconWhenInvisible = 'puzzle';

/* Static Methods */

/**
 * Get a plain text description of the template parts in a transclusion node, excluding raw wikitext
 * snippets.
 *
 * @static
 * @param {ve.dm.MWTransclusionNode} model
 * @return {string} Comma-separated list of template names
 */
ve.ce.MWTransclusionNode.static.getDescription = function ( model ) {
	return model.getPartsList()
		.map( function ( part ) {
			if ( part.templatePage ) {
				return mw.Title.newFromText( part.templatePage )
					.getRelativeText( mw.config.get( 'wgNamespaceIds' ).template );
			}
			// Not actually a template, but e.g. a parser function
			return part.template || '';
		} )
		.filter( function ( desc ) {
			return desc;
		} )
		.join( ve.msg( 'comma-separator' ) );
};

/**
 * Get a formatted description of the template parts in a transclusion node, excluding raw wikitext
 * snippets.
 *
 * Like #getDescription, but parts generated from templates are linked to
 * those templates
 *
 * @static
 * @param {ve.dm.MWTransclusionNode} model
 * @return {HTMLElement} DOM node with comma-separated list of template names
 */
ve.ce.MWTransclusionNode.static.getDescriptionDom = function ( model ) {
	var nodes = model.getPartsList()
		.map( function ( part ) {
			if ( part.templatePage ) {
				var title = mw.Title.newFromText( part.templatePage );
				var link = document.createElement( 'a' );
				link.textContent = title.getRelativeText( mw.config.get( 'wgNamespaceIds' ).template );
				link.setAttribute( 'href', title.getUrl() );
				return link;
			}
			// Not actually a template, but e.g. a parser function
			return part.template ? document.createTextNode( part.template ) : null;
		} )
		.filter( function ( desc ) {
			return desc;
		} );
	var span = document.createElement( 'span' );
	nodes.forEach( function ( node, i ) {
		if ( i ) {
			span.appendChild( document.createTextNode( ve.msg( 'comma-separator' ) ) );
		}
		span.appendChild( node );
	} );
	ve.targetLinksToNewWindow( span );
	return span;
};

/**
 * Filter rendering to remove auto-generated content and wrappers
 *
 * @static
 * @param {Node[]} contentNodes Rendered nodes
 * @return {Node[]} Filtered rendered nodes
 */
ve.ce.MWTransclusionNode.static.filterRendering = function ( contentNodes ) {
	if ( !contentNodes.length ) {
		return [];
	}

	var whitespaceRegex = new RegExp( '^[' + ve.dm.Converter.static.whitespaceList + ']+$' );

	// Filter out auto-generated items, e.g. reference lists
	contentNodes = contentNodes.filter( function ( node ) {
		var dataMw = node &&
			node.nodeType === Node.ELEMENT_NODE &&
			node.hasAttribute( 'data-mw' ) &&
			JSON.parse( node.getAttribute( 'data-mw' ) );

		return !dataMw || !dataMw.autoGenerated;
	} );

	contentNodes.forEach( function ( node ) {
		if ( node.nodeType === Node.ELEMENT_NODE ) {
			mw.libs.ve.stripParsoidFallbackIds( node );
		}
	} );

	function isWhitespaceNode( node ) {
		return node && node.nodeType === Node.TEXT_NODE && whitespaceRegex.test( node.data );
	}

	while ( isWhitespaceNode( contentNodes[ 0 ] ) ) {
		contentNodes.shift();
	}
	while ( isWhitespaceNode( contentNodes[ contentNodes.length - 1 ] ) ) {
		contentNodes.pop();
	}
	// HACK: if $content consists of a single paragraph, unwrap it.
	// We have to do this because the parser wraps everything in <p>s, and inline templates
	// will render strangely when wrapped in <p>s.
	if ( contentNodes.length === 1 && contentNodes[ 0 ].nodeName.toLowerCase() === 'p' ) {
		contentNodes = Array.prototype.slice.call( contentNodes[ 0 ].childNodes );
	}
	return contentNodes;
};

/* Methods */

/** @inheritDoc */
ve.ce.MWTransclusionNode.prototype.executeCommand = function () {
	var contextItems = this.focusableSurface.getSurface().getContext().items;
	if ( contextItems[ 0 ] instanceof ve.ui.MWTransclusionContextItem ) {
		// Utilize the context item when it's there instead of triggering the command manually.
		// Required to make the context item show the "Loading…" message (see T297773).
		contextItems[ 0 ].onEditButtonClick( 'command' );
		return;
	}

	// Parent method
	ve.ce.FocusableNode.prototype.executeCommand.apply( this, arguments );
};

/**
 * @inheritdoc
 */
ve.ce.MWTransclusionNode.prototype.generateContents = function ( config ) {
	var deferred = ve.createDeferred();
	var xhr = ve.init.target.parseWikitextFragment(
		( config && config.wikitext ) || this.model.getWikitext(),
		true,
		this.getModel().getDocument()
	)
		.done( this.onParseSuccess.bind( this, deferred ) )
		.fail( this.onParseError.bind( this, deferred ) );

	return deferred.promise( { abort: xhr.abort } );
};

/**
 * Handle a successful response from the parser for the wikitext fragment.
 *
 * @param {jQuery.Deferred} deferred The Deferred object created by #generateContents
 * @param {Object} response Response data
 */
ve.ce.MWTransclusionNode.prototype.onParseSuccess = function ( deferred, response ) {
	if ( ve.getProp( response, 'visualeditor', 'result' ) !== 'success' ) {
		this.onParseError( deferred );
		return;
	}

	// Work around https://github.com/jquery/jquery/issues/1997
	var contentNodes = $.parseHTML( response.visualeditor.content, this.model && this.getModelHtmlDocument() ) || [];
	deferred.resolve( this.constructor.static.filterRendering( contentNodes ) );
};

/**
 * Extend the ve.ce.GeneratedContentNode render method to check for hidden templates.
 *
 * Check if the final result of the imported template is empty.
 *
 * @inheritdoc ve.ce.GeneratedContentNode
 */
ve.ce.MWTransclusionNode.prototype.render = function ( generatedContents ) {
	// Call parent mixin
	ve.ce.GeneratedContentNode.prototype.render.call( this, generatedContents );
};

/**
 * @inheritdoc
 */
ve.ce.MWTransclusionNode.prototype.onSetup = function () {
	// Parent method
	ve.ce.MWTransclusionNode.super.prototype.onSetup.apply( this, arguments );

	// Render replaces this.$element with a new node so re-add classes
	this.$element.addClass( 've-ce-mwTransclusionNode' );
};

/**
 * @inheritdoc
 */
ve.ce.MWTransclusionNode.prototype.getRenderedDomElements = function () {
	// Parent method
	var elements = ve.ce.GeneratedContentNode.prototype.getRenderedDomElements.apply( this, arguments );

	if ( this.model && this.getModelHtmlDocument() ) {
		ve.init.platform.linkCache.styleParsoidElements(
			$( elements ),
			this.getModelHtmlDocument()
		);
	}
	return elements;
};

/**
 * @inheritdoc
 */
ve.ce.MWTransclusionNode.prototype.filterRenderedDomElements = function ( domElements ) {
	// We want to remove all styles and links which aren't from TemplateStyles.
	var selector = 'style:not([data-mw-deduplicate^="TemplateStyles:"]), link:not([rel~="mw-deduplicated-inline-style"][href^="mw-data:TemplateStyles:"])';
	return $( domElements ).find( selector ).addBack( selector ).remove().end().end().toArray();
};

/**
 * Handle an unsuccessful response from the parser for the wikitext fragment.
 *
 * @param {jQuery.Deferred} deferred The promise object created by #generateContents
 * @param {Object} response Response data
 */
ve.ce.MWTransclusionNode.prototype.onParseError = function ( deferred ) {
	deferred.reject();
};

/* Registration */

ve.ce.nodeFactory.register( ve.ce.MWTransclusionNode );
